export default function RoundScreen({
  currentIndex,
  totalQuestions,
  round,
  question,
  userId,
  isLeader,
  revealedByMe,
  revealNotices,
  displayName,
  onReveal,
  onNext,
  onLeave,
  error,
}) {
  const isAuthor = round?.author_user_id === userId;
  const authorName = round ? displayName(round.author_user_id) : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Round {currentIndex + 1} / {totalQuestions}
        </p>
        <button className="text-gray-400 text-sm underline" onClick={onLeave}>
          Leave
        </button>
      </div>

      {round && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 inline-block">
          Question by <strong>{authorName}</strong>
          {isAuthor ? " (that's you — you already know the answer)" : " — they know the answer"}
        </p>
      )}

      <p className="text-base font-medium whitespace-pre-line">
        {question?.question ?? (round ? `Question #${round.question_id}` : "Loading...")}
      </p>

      {revealNotices.length > 0 && (
        <div className="space-y-1">
          {revealNotices.map((n) => (
            <p key={n.userId} className="text-xs text-indigo-600 italic">
              {displayName(n.userId)} revealed the answer.
            </p>
          ))}
        </div>
      )}

      {!revealedByMe ? (
        <button className="bg-blue-500 text-white px-4 py-2 rounded" onClick={onReveal}>
          Reveal Answer (for me)
        </button>
      ) : (
        <div className="border rounded p-3 bg-gray-50 space-y-1">
          <p><strong>Answer:</strong> {question?.answer ?? "—"}</p>
          {question?.comment && (
            <p className="italic text-gray-600 text-sm">{question.comment}</p>
          )}
        </div>
      )}

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {isLeader ? (
        <button
          className="bg-gray-800 text-white px-4 py-2 rounded"
          onClick={onNext}
        >
          {currentIndex + 1 >= totalQuestions ? "Finish Game" : "Next →"}
        </button>
      ) : (
        <p className="text-xs text-gray-400 italic">Waiting for leader to advance...</p>
      )}
    </div>
  );
}
