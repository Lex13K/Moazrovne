import React, { useEffect, useMemo, useState } from "react";
import Auth from "./components/Auth";
import { supabase } from "./lib/supabaseClient";
import { getMyRatings, upsertRating } from "./api/ratings";
import { downloadJson, createSignedImageUrl } from "./api/storage";

export default function App() {
  const [session, setSession] = useState(null);

  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isRatingDisabled, setIsRatingDisabled] = useState(false);

  const [myRatings, setMyRatings] = useState(new Map());

  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingRatings, setLoadingRatings] = useState(false);
  const [error, setError] = useState("");

  const [imageUrl, setImageUrl] = useState("");

  // --- Auth session wiring ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // --- Load questions ONLY after login (private bucket) ---
  useEffect(() => {
    if (!session) {
      setQuestions([]);
      setCurrent(null);
      return;
    }

    (async () => {
      try {
        setLoadingQuestions(true);
        setError("");

        // Private bucket: questions/questions.json
        const data = await downloadJson("questions", "questions.json");
        setQuestions(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoadingQuestions(false);
      }
    })();
  }, [session]);

  // --- Load this user's ratings after login ---
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

  const unseen = useMemo(() => {
    if (!questions.length) return [];
    return questions.filter((q) => !myRatings.has(q.question_id));
  }, [questions, myRatings]);

  function nextQuestion() {
    if (!unseen.length) {
      setCurrent(null);
      setImageUrl("");
      return;
    }
    const q = unseen[Math.floor(Math.random() * unseen.length)];
    setCurrent(q || null);
    setShowAnswer(false);
    setIsRatingDisabled(false);
  }

  useEffect(() => {
    if (session && questions.length > 0 && unseen.length > 0 && !current) {
      nextQuestion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, questions.length, unseen.length]);

  // --- Load signed URL for the current question's image (private bucket) ---
  useEffect(() => {
    if (!session || !current) {
      setImageUrl("");
      return;
    }

    if (current.image !== 1) {
      setImageUrl("");
      return;
    }

    (async () => {
      try {
        // images/qid_<id>.jpg in PRIVATE bucket "images"
        const url = await createSignedImageUrl("images", `qid_${current.question_id}.jpg`, 120);
        setImageUrl(url);
      } catch (e) {
        // Don't block quiz if image is missing
        console.warn("Failed to load signed image URL:", e);
        setImageUrl("");
      }
    })();
  }, [session, current]);

  async function rateQuestion(score) {
    if (!session) {
      setError("Please sign in to rate questions.");
      return;
    }
    if (!current || isRatingDisabled) return;

    setIsRatingDisabled(true);
    setError("");

    try {
      await upsertRating(current.question_id, score);
      setMyRatings((prev) => {
        const next = new Map(prev);
        next.set(current.question_id, score);
        return next;
      });
      setTimeout(() => nextQuestion(), 300);
    } catch (e) {
      setError(String(e));
      setIsRatingDisabled(false);
    }
  }

  return (
    <main className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🧠 Moazrovne Quiz</h1>

      <div className="mb-4">
        <Auth session={session} />
      </div>

      {error ? <p className="text-red-500 mb-3">{error}</p> : null}

      {!session ? (
        <p className="text-gray-700">Sign in above to load questions and start rating.</p>
      ) : loadingQuestions ? (
        <p>🔄 Loading questions…</p>
      ) : loadingRatings ? (
        <p>🔄 Loading your ratings…</p>
      ) : current ? (
        <div>
          <p className="mb-2 font-medium">Question #{current.question_id}</p>
          <p className="mb-4 whitespace-pre-line">{current.question}</p>

          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Question"
              className="mb-4 rounded border"
              onError={() => setImageUrl("")}
            />
          ) : null}

          {!showAnswer ? (
            <button
              className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
              onClick={() => setShowAnswer(true)}
            >
              Reveal Answer
            </button>
          ) : (
            <>
              <p className="mb-2">
                <strong>Answer:</strong> {current.answer}
              </p>
              {current.comment && <p className="mb-4 italic text-gray-700">{current.comment}</p>}
            </>
          )}

          <p className="mb-2">Rate this question:</p>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                className={`px-2 py-1 rounded ${
                  isRatingDisabled ? "bg-gray-100 text-gray-400" : "bg-gray-200 hover:bg-gray-300"
                }`}
                onClick={() => rateQuestion(n)}
                disabled={isRatingDisabled}
              >
                {n}
              </button>
            ))}
          </div>

          <button className="bg-yellow-400 text-black px-4 py-2 rounded" onClick={nextQuestion}>
            Skip
          </button>

          <p className="text-sm text-gray-600 mt-4">
            Remaining unrated: {unseen.length}
          </p>
        </div>
      ) : (
        <p className="text-green-600 font-semibold mt-10">✅ You’ve rated all questions!</p>
      )}
    </main>
  );
}
