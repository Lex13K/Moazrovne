import { useEffect, useMemo, useState } from "react";
import Auth from "./components/Auth";
import RatingMode from "./components/RatingMode";
import GameMode from "./components/game/GameMode";
import HistoryMode from "./components/HistoryMode";
import { supabase } from "./lib/supabaseClient";
import { getMyRatings } from "./api/ratings";
import { downloadJson } from "./api/storage";

export default function App() {
  const [session, setSession] = useState(null);
  const [mode, setMode] = useState("rating"); // "rating" | "game" | "history"
  const [resetMode, setResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetStatus, setResetStatus] = useState("");

  const [questions, setQuestions] = useState([]);
  const [myRatings, setMyRatings] = useState(new Map());
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingRatings, setLoadingRatings] = useState(false);
  const [error, setError] = useState("");

  // --- Auth session wiring ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "PASSWORD_RECOVERY") {
        setResetMode(true);
        setResetStatus("");
        setNewPassword("");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // --- Load questions after login ---
  useEffect(() => {
    if (!session) {
      setQuestions([]);
      return;
    }
    (async () => {
      try {
        setLoadingQuestions(true);
        setError("");
        const data = await downloadJson("questions", "questions.json");
        setQuestions(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoadingQuestions(false);
      }
    })();
  }, [session]);

  // --- Load user's ratings after login ---
  useEffect(() => {
    if (!session) {
      setMyRatings(new Map());
      return;
    }
    (async () => {
      try {
        setLoadingRatings(true);
        setError("");
        const rows = await getMyRatings();
        setMyRatings(new Map(rows.map((r) => [r.question_id, r.rating])));
      } catch (e) {
        setError(String(e));
      } finally {
        setLoadingRatings(false);
      }
    })();
  }, [session]);

  const ratedCount = useMemo(() => myRatings.size, [myRatings]);

  async function handlePasswordReset(e) {
    e.preventDefault();
    setResetStatus("Saving...");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return setResetStatus(error.message);
    setResetMode(false);
    setNewPassword("");
    setResetStatus("");
  }

  const [viewQuestionId, setViewQuestionId] = useState(null);

  function handleViewQuestion(id) {
    setViewQuestionId(id);
    setMode("rating");
  }

  return (
    <main className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Moazrovne Quiz</h1>

      <div className="mb-4">
        <Auth session={session} />
      </div>

      {error ? <p className="text-red-500 mb-3">{error}</p> : null}

      {resetMode ? (
        <form onSubmit={handlePasswordReset} className="space-y-3 max-w-xs">
          <h2 className="font-semibold text-lg">Set new password</h2>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            minLength={6}
            required
            className="border rounded px-2 py-1 w-full"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={newPassword.length < 6}
              className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              Save password
            </button>
            <button
              type="button"
              className="text-gray-500 underline text-sm self-center"
              onClick={() => { setResetMode(false); setNewPassword(""); setResetStatus(""); }}
            >
              Cancel
            </button>
          </div>
          {resetStatus && <p className="text-sm text-red-500">{resetStatus}</p>}
        </form>
      ) : !session ? (
        <p className="text-gray-700">Sign in above to load questions and start.</p>
      ) : (
        <>
          {/* Mode switcher */}
          <div className="flex gap-2 mb-5 border-b pb-3 flex-wrap">
            <button
              onClick={() => setMode("rating")}
              className={`px-3 py-1 rounded text-sm font-medium ${
                mode === "rating" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Rating Mode
            </button>
            <button
              onClick={() => setMode("game")}
              className={`px-3 py-1 rounded text-sm font-medium ${
                mode === "game" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Game Mode
            </button>
            <button
              onClick={() => setMode("history")}
              className={`px-3 py-1 rounded text-sm font-medium ${
                mode === "history" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              History
            </button>
            {mode === "game" && ratedCount > 0 && (
              <span className="text-xs text-gray-400 self-center ml-1">
                {ratedCount} rated question{ratedCount !== 1 ? "s" : ""} available
              </span>
            )}
          </div>

          {/* All three components stay mounted so switching tabs never loses state */}
          <div className={mode === "rating" ? "" : "hidden"}>
            <RatingMode
              questions={questions}
              myRatings={myRatings}
              setMyRatings={setMyRatings}
              loadingQuestions={loadingQuestions}
              loadingRatings={loadingRatings}
              viewQuestionId={viewQuestionId}
              onClearView={() => setViewQuestionId(null)}
            />
          </div>

          <div className={mode === "game" ? "" : "hidden"}>
            {session && (
              <GameMode
                session={session}
                questions={questions}
                myRatings={myRatings}
              />
            )}
          </div>

          <div className={mode === "history" ? "" : "hidden"}>
            {session && (
              <HistoryMode
                questions={questions}
                myRatings={myRatings}
                setMyRatings={setMyRatings}
                onViewQuestion={handleViewQuestion}
              />
            )}
          </div>
        </>
      )}
    </main>
  );
}

