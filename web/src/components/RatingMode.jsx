import { useEffect, useMemo, useState } from "react";
import { upsertRating } from "../api/ratings";
import { createSignedImageUrl } from "../api/storage";

export default function RatingMode({ questions, myRatings, setMyRatings, loadingQuestions, loadingRatings, viewQuestionId, onClearView }) {
  const [current, setCurrent] = useState(null);
  const [pinnedQuestionId, setPinnedQuestionId] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isRatingDisabled, setIsRatingDisabled] = useState(false);
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [gotoInput, setGotoInput] = useState("");
  const [gotoError, setGotoError] = useState("");

  const questionsById = useMemo(() => {
    const m = new Map();
    questions.forEach((q) => m.set(q.question_id, q));
    return m;
  }, [questions]);

  const unseen = useMemo(() => {
    if (!questions.length) return [];
    return questions.filter((q) => !myRatings.has(q.question_id));
  }, [questions, myRatings]);

  // When the parent signals a specific question to view, pin it.
  useEffect(() => {
    if (!viewQuestionId || !questions.length) return;
    const q = questionsById.get(viewQuestionId);
    if (q) {
      setCurrent(q);
      setPinnedQuestionId(viewQuestionId);
      setShowAnswer(false);
      setIsRatingDisabled(false);
      setError("");
    }
    onClearView?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewQuestionId, questions.length]);

  function nextQuestion() {
    setPinnedQuestionId(null);
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
    if (questions.length > 0 && unseen.length > 0 && !current) {
      nextQuestion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length, unseen.length]);

  useEffect(() => {
    if (!current) { setImageUrl(""); return; }
    if (current.image !== 1) { setImageUrl(""); return; }
    (async () => {
      try {
        const url = await createSignedImageUrl("images", `qid_${current.question_id}.jpg`, 120);
        setImageUrl(url);
      } catch (e) {
        console.warn("Failed to load signed image URL:", e);
        setImageUrl("");
      }
    })();
  }, [current]);

  async function rateQuestion(score) {
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

  function handleGoto(e) {
    e.preventDefault();
    setGotoError("");
    const id = parseInt(gotoInput.trim(), 10);
    if (isNaN(id)) {
      setGotoError("Enter a valid question number.");
      return;
    }
    const q = questionsById.get(id);
    if (!q) {
      setGotoError(`Question #${id} not found.`);
      return;
    }
    setCurrent(q);
    setPinnedQuestionId(id);
    setShowAnswer(false);
    setIsRatingDisabled(false);
    setError("");
    setGotoInput("");
  }

  if (loadingQuestions) return <p>Loading questions...</p>;
  if (loadingRatings) return <p>Loading your ratings...</p>;

  const isPinned = pinnedQuestionId != null;
  const alreadyRated = current ? myRatings.has(current.question_id) : false;
  const existingRating = current ? myRatings.get(current.question_id) : null;

  return (
    <div>
      {error ? <p className="text-red-500 mb-3">{error}</p> : null}

      {current ? (
        <div>
          {/* Pinned-question banner */}
          {isPinned && (
            <div className="flex items-center gap-2 mb-3 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
              <span>
                Viewing #{current.question_id}
                {alreadyRated ? ` · currently rated ★${existingRating}` : " · unrated"}
              </span>
              <button
                className="ml-auto text-xs text-blue-500 hover:text-blue-700 underline"
                onClick={nextQuestion}
              >
                Back to queue
              </button>
            </div>
          )}

          <p className="mb-2 font-medium">Question #{current.question_id}</p>
          <p className="mb-4 whitespace-pre-line">{current.question}</p>

          {imageUrl ? (
            <img src={imageUrl} alt="Question" className="mb-4 rounded border" onError={() => setImageUrl("")} />
          ) : null}

          {!showAnswer ? (
            <button className="bg-blue-500 text-white px-4 py-2 rounded mb-4" onClick={() => setShowAnswer(true)}>
              Reveal Answer
            </button>
          ) : (
            <>
              <p className="mb-2"><strong>Answer:</strong> {current.answer}</p>
              {current.comment && <p className="mb-4 italic text-gray-700">{current.comment}</p>}
            </>
          )}

          <p className="mb-2">Rate this question:</p>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                className={`px-2 py-1 rounded ${
                  isRatingDisabled
                    ? "bg-gray-100 text-gray-400"
                    : existingRating === n
                    ? "bg-yellow-400 text-black font-bold"
                    : "bg-gray-200 hover:bg-gray-300"
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

          {!isPinned && (
            <p className="text-sm text-gray-600 mt-4">Remaining unrated: {unseen.length}</p>
          )}
        </div>
      ) : (
        <p className="text-green-600 font-semibold mt-10">You've rated all questions!</p>
      )}

      {/* Go to question by number */}
      <form onSubmit={handleGoto} className="flex items-center gap-2 mt-6 pt-4 border-t">
        <label className="text-sm text-gray-500 shrink-0">Go to #</label>
        <input
          type="number"
          min="1"
          value={gotoInput}
          onChange={(e) => { setGotoInput(e.target.value); setGotoError(""); }}
          placeholder="question id"
          className="border rounded px-2 py-1 text-sm w-28"
        />
        <button
          type="submit"
          className="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
        >
          Go
        </button>
        {gotoError && <span className="text-xs text-red-500">{gotoError}</span>}
      </form>
    </div>
  );
}
