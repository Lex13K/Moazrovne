import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import * as game from "../../api/game";
import HomeScreen from "./HomeScreen";
import Lobby from "./Lobby";
import PicksScreen from "./PicksScreen";
import RoundScreen from "./RoundScreen";
import GameOver from "./GameOver";

export default function GameMode({ session, questions, myRatings }) {
  const userId = session.user.id;

  const [phase, setPhase] = useState("home");
  const [party, setParty] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [members, setMembers] = useState([]);
  const [profilesMap, setProfilesMap] = useState(new Map());
  const [playerStates, setPlayerStates] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealedByMe, setRevealedByMe] = useState(false);
  const [revealNotices, setRevealNotices] = useState([]);
  const [userStats, setUserStats] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const statsMap = useMemo(
    () => new Map(userStats.map((s) => [s.question_id, s])),
    [userStats]
  );

  const roundsLoadedRef = useRef(false);

  // Auto-create profile from email prefix (only if user has no profile yet)
  useEffect(() => {
    game.upsertProfile(session.user.email.split("@")[0]).catch(() => {});
  }, [session.user.email]);

  // Load rounds once when entering game phase
  useEffect(() => {
    if (phase === "game" && !roundsLoadedRef.current && sessionData?.id) {
      roundsLoadedRef.current = true;
      game.getRounds(sessionData.id).then(setRounds).catch(console.error);
    }
  }, [phase, sessionData?.id]);

  function displayName(uid) {
    return profilesMap.get(uid) ?? uid.slice(0, 8);
  }

  async function refreshStats() {
    try {
      const s = await game.getUserQuestionStats();
      setUserStats(s);
    } catch (e) { console.error("stats fetch failed:", e); }
  }

  async function refreshMembers(partyId) {
    const mems = await game.getPartyMembers(partyId);
    setMembers(mems);
    if (mems.length) {
      const profiles = await game.getProfiles(mems.map((m) => m.user_id));
      setProfilesMap(new Map(profiles.map((p) => [p.user_id, p.display_name])));
    }
  }

  // --- Party Realtime channel (lobby + picking) ---
  useEffect(() => {
    if (!party?.id) return;
    const ch = supabase
      .channel(`party:${party.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "party_members", filter: `party_id=eq.${party.id}` },
        async () => {
          try { await refreshMembers(party.id); } catch (e) { console.error(e); }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "parties", filter: `id=eq.${party.id}` },
        async (payload) => {
          const updated = payload.new;
          setParty(updated);
          if (updated.status === "picking") {
            try {
              const sess = await game.getLatestSessionForParty(party.id);
              if (sess) {
                setSessionData(sess);
                const states = await game.getPlayerStates(sess.id);
                setPlayerStates(states);
              }
              await refreshStats();
            } catch (e) { console.error(e); }
            setPhase("picking");
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [party?.id]);

  // --- Session Realtime channel (picking + game) ---
  useEffect(() => {
    if (!sessionData?.id) return;
    const sid = sessionData.id;
    const ch = supabase
      .channel(`session:${sid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_player_state", filter: `session_id=eq.${sid}` },
        async () => {
          try {
            const states = await game.getPlayerStates(sid);
            setPlayerStates(states);
          } catch (e) { console.error(e); }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_sessions", filter: `id=eq.${sid}` },
        (payload) => {
          const s = payload.new;
          setSessionData(s);
          if (s.status === "active") {
            setCurrentIndex(s.current_index);
            setRevealedByMe(false);
            setRevealNotices([]);
            setPhase("game");
          } else if (s.status === "finished") {
            setPhase("finished");
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_events", filter: `session_id=eq.${sid}` },
        (payload) => {
          const evt = payload.new;
          if (evt.event_type === "reveal" && evt.actor_user_id !== userId) {
            const ri = evt.payload?.round_index;
            setRevealNotices((prev) => {
              if (prev.some((n) => n.userId === evt.actor_user_id && n.roundIndex === ri)) return prev;
              return [...prev, { userId: evt.actor_user_id, roundIndex: ri }];
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionData?.id, userId]);

  // --- Handlers ---

  async function handleCreateParty(n) {
    setLoading(true); setError("");
    try {
      const p = await game.createParty(n);
      setParty(p);
      await refreshMembers(p.id);
      setPhase("lobby");
    } catch (e) { setError(e?.message ?? String(e)); }
    finally { setLoading(false); }
  }

  async function handleJoinParty(code) {
    setLoading(true); setError("");
    try {
      const p = await game.joinParty(code);
      setParty(p);
      await refreshMembers(p.id);
      setPhase("lobby");
    } catch (e) { setError(e?.message ?? String(e)); }
    finally { setLoading(false); }
  }

  async function handleStartGame() {
    setLoading(true); setError("");
    try {
      await game.startGame(party.id);
      // All players transition via Realtime (parties UPDATE → status=picking)
    } catch (e) { setError(e?.message ?? String(e)); }
    finally { setLoading(false); }
  }

  async function handleSubmitPicks(questionIds) {
    setLoading(true); setError("");
    try {
      await game.submitPicks(sessionData.id, questionIds);
      // game_player_state UPDATE refreshes player states via Realtime
    } catch (e) { setError(e?.message ?? String(e)); }
    finally { setLoading(false); }
  }

  async function handleBeginGame() {
    setLoading(true); setError("");
    try {
      await game.beginGame(sessionData.id);
      // All players transition via Realtime (game_sessions UPDATE → status=active)
    } catch (e) { setError(e?.message ?? String(e)); }
    finally { setLoading(false); }
  }

  async function handleReveal() {
    setError("");
    try {
      await game.revealAnswer(sessionData.id, currentIndex);
      setRevealedByMe(true);
    } catch (e) { setError(e?.message ?? String(e)); }
  }

  async function handleNext() {
    setError("");
    try {
      await game.nextRound(sessionData.id);
      // currentIndex update via Realtime (game_sessions UPDATE)
    } catch (e) { setError(e?.message ?? String(e)); }
  }

  function handleLeave() {
    roundsLoadedRef.current = false;
    setPhase("home");
    setParty(null);
    setSessionData(null);
    setMembers([]);
    setPlayerStates([]);
    setRounds([]);
    setCurrentIndex(0);
    setRevealedByMe(false);
    setRevealNotices([]);
    setUserStats([]);
    setError("");
    setLoading(false);
  }

  const isLeader = party?.leader_user_id === userId;
  const currentRound = rounds[currentIndex] ?? null;
  const currentQuestion = currentRound
    ? questions.find((q) => q.question_id === currentRound.question_id) ?? null
    : null;
  const currentRevealNotices = revealNotices.filter((n) => n.roundIndex === currentIndex);

  if (phase === "home") {
    return <HomeScreen onCreate={handleCreateParty} onJoin={handleJoinParty} error={error} loading={loading} />;
  }
  if (phase === "lobby") {
    return (
      <Lobby
        party={party}
        members={members}
        profilesMap={profilesMap}
        userId={userId}
        isLeader={isLeader}
        onStartGame={handleStartGame}
        onLeave={handleLeave}
        error={error}
        loading={loading}
      />
    );
  }
  if (phase === "picking") {
    return (
      <PicksScreen
        party={party}
        session={sessionData}
        questions={questions}
        myRatings={myRatings}
        statsMap={statsMap}
        playerStates={playerStates}
        members={members}
        profilesMap={profilesMap}
        userId={userId}
        isLeader={isLeader}
        onSubmitPicks={handleSubmitPicks}
        onBeginGame={handleBeginGame}
        onLeave={handleLeave}
        error={error}
        loading={loading}
      />
    );
  }
  if (phase === "game") {
    return (
      <RoundScreen
        session={sessionData}
        currentIndex={currentIndex}
        totalQuestions={rounds.length}
        round={currentRound}
        question={currentQuestion}
        userId={userId}
        isLeader={isLeader}
        revealedByMe={revealedByMe}
        revealNotices={currentRevealNotices}
        displayName={displayName}
        onReveal={handleReveal}
        onNext={handleNext}
        onLeave={handleLeave}
        error={error}
      />
    );
  }
  if (phase === "finished") {
    return <GameOver onLeave={handleLeave} />;
  }
  return null;
}
