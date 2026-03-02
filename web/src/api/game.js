import { supabase } from "../lib/supabaseClient";

// --- User profiles ---

export async function upsertProfile(displayName) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return;
  const { error } = await supabase
    .from("user_profiles")
    .upsert({ user_id: u.user.id, display_name: displayName }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function getProfiles(userIds) {
  if (!userIds.length) return [];
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id, display_name")
    .in("user_id", userIds);
  if (error) throw error;
  return data ?? [];
}

// --- Parties ---

export async function createParty(questionsPerPlayer) {
  const { data, error } = await supabase.rpc("create_party", {
    p_questions_per_player: questionsPerPlayer,
  });
  if (error) throw error;
  return data;
}

export async function joinParty(code) {
  const { data, error } = await supabase.rpc("join_party", { p_code: code });
  if (error) throw error;
  return data;
}

export async function getPartyMembers(partyId) {
  const { data, error } = await supabase
    .from("party_members")
    .select("user_id, joined_at")
    .eq("party_id", partyId);
  if (error) throw error;
  return data ?? [];
}

export async function getLatestSessionForParty(partyId) {
  const { data, error } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("party_id", partyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function startGame(partyId) {
  const { data, error } = await supabase.rpc("start_game", { p_party_id: partyId });
  if (error) throw error;
  return data; // { session_id }
}

// --- Sessions ---

export async function getPlayerStates(sessionId) {
  const { data, error } = await supabase
    .from("game_player_state")
    .select("user_id, is_ready")
    .eq("session_id", sessionId);
  if (error) throw error;
  return data ?? [];
}

export async function submitPicks(sessionId, questionIds) {
  const { error } = await supabase.rpc("submit_picks", {
    p_session_id: sessionId,
    p_question_ids: questionIds,
  });
  if (error) throw error;
}

export async function beginGame(sessionId) {
  const { error } = await supabase.rpc("begin_game", { p_session_id: sessionId });
  if (error) throw error;
}

// --- Rounds ---

export async function getRounds(sessionId) {
  const { data, error } = await supabase
    .from("game_rounds")
    .select("round_index, question_id, author_user_id")
    .eq("session_id", sessionId)
    .order("round_index");
  if (error) throw error;
  return data ?? [];
}

// --- Events ---

export async function revealAnswer(sessionId, roundIndex) {
  const { error } = await supabase.rpc("reveal_answer", {
    p_session_id: sessionId,
    p_round_index: roundIndex,
  });
  if (error) throw error;
}

export async function nextRound(sessionId) {
  const { error } = await supabase.rpc("next_round", { p_session_id: sessionId });
  if (error) throw error;
}

// --- Stats ---

export async function getUserQuestionStats() {
  const { data, error } = await supabase.rpc("get_user_question_stats");
  if (error) throw error;
  return data ?? [];
}

export async function getRatingsSummary() {
  const { data, error } = await supabase.rpc("get_ratings_summary");
  if (error) throw error;
  return data?.[0] ?? null;
}
