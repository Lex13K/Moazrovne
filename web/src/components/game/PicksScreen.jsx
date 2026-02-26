import { useMemo, useState } from "react";

const SORT_FIELDS = [
  ["rating", "Rating"],
  ["played_count", "Plays"],
  ["last_rated_at", "Rated"],
  ["last_played_at", "Played"],
];

function fmtDate(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function statsLine(s) {
  if (!s) return null;
  const parts = [];
  if (s.rating != null) parts.push(`★${s.rating}`);
  if (Number(s.played_count) > 0) parts.push(`${s.played_count}× played`);
  const rated = fmtDate(s.last_rated_at);
  const played = fmtDate(s.last_played_at);
  if (rated) parts.push(`rated ${rated}`);
  if (played) parts.push(`played ${played}`);
  return parts.length ? parts.join(" · ") : null;
}

function sortVal(s, field) {
  if (!s) {
    if (field === "played_count") return -Infinity;
    return -Infinity;
  }
  switch (field) {
    case "rating":       return s.rating ?? -Infinity;
    case "played_count": return Number(s.played_count) ?? 0;
    case "last_rated_at":  return s.last_rated_at  ? new Date(s.last_rated_at).getTime()  : -Infinity;
    case "last_played_at": return s.last_played_at ? new Date(s.last_played_at).getTime() : -Infinity;
    default: return -Infinity;
  }
}

export default function PicksScreen({
  party,
  session,
  questions,
  myRatings,
  statsMap,
  playerStates,
  members,
  profilesMap,
  userId,
  isLeader,
  onSubmitPicks,
  onBeginGame,
  onLeave,
  error,
  loading,
}) {
  const n = party?.questions_per_player ?? 3;
  const [selected, setSelected] = useState(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState("rating");
  const [sortDir, setSortDir] = useState("desc");

  const ratedQuestions = useMemo(() => {
    return questions.filter((q) => myRatings.has(q.question_id));
  }, [questions, myRatings]);

  const sortedFiltered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const base = q
      ? ratedQuestions.filter(
          (r) =>
            r.question.toLowerCase().includes(q) ||
            String(r.question_id).includes(q)
        )
      : ratedQuestions;

    return [...base].sort((a, b) => {
      const sa = statsMap?.get(a.question_id);
      const sb = statsMap?.get(b.question_id);
      const va = sortVal(sa, sortField);
      const vb = sortVal(sb, sortField);
      if (va === vb) return 0;
      return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
  }, [ratedQuestions, filter, sortField, sortDir, statsMap]);

  function toggle(qid) {
    if (submitted) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) {
        next.delete(qid);
      } else if (next.size < n) {
        next.add(qid);
      }
      return next;
    });
  }

  function handleSortClick(field) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  async function handleSubmit() {
    await onSubmitPicks(Array.from(selected));
    setSubmitted(true);
  }

  const allReady = playerStates.length > 0 && playerStates.every((s) => s.is_ready);
  const myState = playerStates.find((s) => s.user_id === userId);
  const iAmReady = myState?.is_ready ?? false;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Pick {n} questions to play</h2>
        <button className="text-gray-400 text-sm underline" onClick={onLeave}>
          Leave
        </button>
      </div>

      {!iAmReady ? (
        <>
          <p className="text-sm text-gray-500">
            {selected.size} / {n} selected — choose from your rated questions.
          </p>

          {/* Sort controls */}
          <div className="flex gap-1 flex-wrap items-center">
            <span className="text-xs text-gray-400">Sort:</span>
            {SORT_FIELDS.map(([field, label]) => (
              <button
                key={field}
                className={`text-xs px-2 py-0.5 rounded ${
                  sortField === field
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                onClick={() => handleSortClick(field)}
              >
                {label}
                {sortField === field ? (sortDir === "desc" ? " ▼" : " ▲") : ""}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search questions..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border rounded px-2 py-1 w-full text-sm"
          />

          <ul className="space-y-1 max-h-72 overflow-y-auto border rounded p-2">
            {sortedFiltered.length === 0 && (
              <li className="text-sm text-gray-400 italic">No rated questions found.</li>
            )}
            {sortedFiltered.map((q) => {
              const checked = selected.has(q.question_id);
              const meta = statsMap?.get(q.question_id);
              const line = statsLine(meta);
              return (
                <li
                  key={q.question_id}
                  className={`flex items-start gap-2 p-1 rounded cursor-pointer text-sm hover:bg-gray-50 ${checked ? "bg-indigo-50" : ""}`}
                  onClick={() => toggle(q.question_id)}
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={checked}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="min-w-0">
                    <span>
                      <span className="text-gray-400 mr-1">#{q.question_id}</span>
                      {q.question.length > 100 ? q.question.slice(0, 100) + "…" : q.question}
                    </span>
                    {line && (
                      <div className="text-xs text-gray-400 mt-0.5">{line}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <button
            className="bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-50"
            disabled={selected.size !== n || loading}
            onClick={handleSubmit}
          >
            {loading ? "Submitting..." : `Submit picks (${selected.size}/${n})`}
          </button>
        </>
      ) : (
        <p className="text-green-600 font-medium">Your picks are locked in!</p>
      )}

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div>
        <p className="text-sm font-semibold text-gray-600 mb-1">Player status:</p>
        <ul className="space-y-1">
          {members.map((m) => {
            const state = playerStates.find((s) => s.user_id === m.user_id);
            const ready = state?.is_ready ?? false;
            return (
              <li key={m.user_id} className="flex items-center gap-2 text-sm">
                <span className={ready ? "text-green-600" : "text-gray-400"}>{ready ? "✓" : "…"}</span>
                <span>{profilesMap.get(m.user_id) ?? m.user_id.slice(0, 8)}</span>
                {m.user_id === userId && <span className="text-xs text-gray-400">(you)</span>}
              </li>
            );
          })}
        </ul>
      </div>

      {isLeader && allReady && (
        <button
          className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
          onClick={onBeginGame}
          disabled={loading}
        >
          {loading ? "Starting..." : "Begin Game"}
        </button>
      )}

      {isLeader && !allReady && iAmReady && (
        <p className="text-sm text-gray-500 italic">Waiting for everyone to pick...</p>
      )}
    </div>
  );
}
