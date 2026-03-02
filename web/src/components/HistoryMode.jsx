import { useEffect, useMemo, useState } from "react";
import { getUserQuestionStats } from "../api/game";
import { upsertRating } from "../api/ratings";

const SORT_FIELDS = [
  ["rating", "Rating"],
  ["played_count", "Plays"],
  ["last_rated_at", "Last Rated"],
  ["last_played_at", "Last Played"],
];

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function sortVal(row, field) {
  switch (field) {
    case "rating":       return row.rating ?? -Infinity;
    case "played_count": return Number(row.played_count) ?? 0;
    case "last_rated_at":  return row.last_rated_at  ? new Date(row.last_rated_at).getTime()  : -Infinity;
    case "last_played_at": return row.last_played_at ? new Date(row.last_played_at).getTime() : -Infinity;
    default: return -Infinity;
  }
}

export default function HistoryMode({ questions, myRatings, setMyRatings, onViewQuestion }) {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterText, setFilterText] = useState("");
  const [sortField, setSortField] = useState("last_rated_at");
  const [sortDir, setSortDir] = useState("desc");
  const [editingId, setEditingId] = useState(null);
  const [ratingBusy, setRatingBusy] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    setError("");
    try {
      const s = await getUserQuestionStats();
      setStats(s);
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  const questionsById = useMemo(() => {
    const m = new Map();
    questions.forEach((q) => m.set(q.question_id, q));
    return m;
  }, [questions]);

  const rows = useMemo(() => {
    return stats.map((s) => ({
      ...s,
      questionObj: questionsById.get(s.question_id) ?? null,
    }));
  }, [stats, questionsById]);

  const displayRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const base = q
      ? rows.filter(
          (r) =>
            r.questionObj?.question?.toLowerCase().includes(q) ||
            String(r.question_id).includes(q)
        )
      : rows;

    return [...base].sort((a, b) => {
      const va = sortVal(a, sortField);
      const vb = sortVal(b, sortField);
      if (va === vb) return 0;
      return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
  }, [rows, filterText, sortField, sortDir]);

  function handleSortClick(field) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  async function handleRate(questionId, score) {
    if (ratingBusy) return;
    setRatingBusy(true);
    try {
      await upsertRating(questionId, score);
      const now = new Date().toISOString();
      setMyRatings((prev) => {
        const next = new Map(prev);
        next.set(questionId, score);
        return next;
      });
      setStats((prev) =>
        prev.map((s) => {
          if (s.question_id !== questionId) return s;
          return {
            ...s,
            rating: score,
            last_rated_at: now,
            first_rated_at: s.first_rated_at ?? now,
          };
        })
      );
      setEditingId(null);
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setRatingBusy(false);
    }
  }

  if (loading) {
    return <p className="text-gray-500 text-sm">Loading history...</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">History</h2>
        <span className="text-xs text-gray-400">{displayRows.length} question{displayRows.length !== 1 ? "s" : ""}</span>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* Sort controls */}
      <div className="flex gap-1 flex-wrap items-center">
        <span className="text-xs text-gray-400">Sort:</span>
        {SORT_FIELDS.map(([field, label]) => (
          <button
            key={field}
            className={`text-xs px-2 py-0.5 rounded ${
              sortField === field
                ? "bg-blue-600 text-white"
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
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
        className="border rounded px-2 py-1 w-full text-sm"
      />

      {displayRows.length === 0 && (
        <p className="text-sm text-gray-400 italic">
          {filterText ? "No matching questions." : "No rated or played questions yet."}
        </p>
      )}

      <ul className="space-y-1 divide-y">
        {displayRows.map((row) => {
          const text = row.questionObj?.question ?? `Question #${row.question_id}`;
          const isEditing = editingId === row.question_id;
          const playCount = Number(row.played_count);

          return (
            <li key={row.question_id} className="pt-2 pb-1">
              {/* Question text */}
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0 text-sm">
                  <span className="text-gray-400 mr-1 text-xs">#{row.question_id}</span>
                  {text.length > 120 ? text.slice(0, 120) + "…" : text}
                </div>
                {/* View button */}
                <button
                  className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                  title="View in Rating Mode"
                  onClick={() => onViewQuestion?.(row.question_id)}
                >
                  View
                </button>
                {/* Rating badge — click to open editor */}
                <button
                  className={`shrink-0 text-sm font-semibold px-1.5 py-0.5 rounded ${
                    row.rating != null
                      ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                      : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                  }`}
                  title="Click to rate"
                  onClick={() => setEditingId(isEditing ? null : row.question_id)}
                >
                  {row.rating != null ? `★${row.rating}` : "Rate"}
                </button>
              </div>

              {/* Metadata line */}
              <div className="flex gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
                <span>{playCount > 0 ? `${playCount}× played` : "never played"}</span>
                <span>rated {fmtDate(row.last_rated_at)}</span>
                {row.last_played_at && <span>last played {fmtDate(row.last_played_at)}</span>}
              </div>

              {/* Inline rating picker */}
              {isEditing && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      disabled={ratingBusy}
                      onClick={() => handleRate(row.question_id, n)}
                      className={`w-7 h-7 text-xs rounded border ${
                        row.rating === n
                          ? "bg-yellow-400 border-yellow-500 font-bold"
                          : "bg-white border-gray-200 hover:bg-gray-50"
                      } disabled:opacity-50`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    className="text-xs text-gray-400 px-1 hover:text-gray-600"
                    onClick={() => setEditingId(null)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
