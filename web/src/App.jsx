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

  const [questions, setQuestions] = useState([]);
  const [myRatings, setMyRatings] = useState(new Map());
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingRatings, setLoadingRatings] = useState(false);
  const [error, setError] = useState("");

  // --- Auth session wiring ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
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

  return (
    <main className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Moazrovne Quiz</h1>

      <div className="mb-4">
        <Auth session={session} />
      </div>

      {error ? <p className="text-red-500 mb-3">{error}</p> : null}

      {!session ? (
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
              />
            )}
          </div>
        </>
      )}
    </main>
  );
}
