import { useState } from "react";

export default function HomeScreen({ onCreate, onJoin, error, loading }) {
  const [view, setView] = useState("choose");
  const [n, setN] = useState(3);
  const [nRaw, setNRaw] = useState("3");
  const [code, setCode] = useState("");

  if (view === "choose") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Rate questions in Rating Mode first to build your pool, then come back here to play with friends.
        </p>
        <div className="flex gap-3">
          <button className="bg-green-600 text-white px-4 py-2 rounded" onClick={() => setView("create")}>
            Create Party
          </button>
          <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={() => setView("join")}>
            Join Party
          </button>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>
    );
  }

  if (view === "create") {
    return (
      <div className="space-y-4">
        <h2 className="font-semibold text-lg">Create Party</h2>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Questions each player must pick (1–10):</label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="w-9 h-9 rounded bg-gray-200 hover:bg-gray-300 text-lg font-bold disabled:opacity-40"
              onClick={() => { const v = Math.max(1, n - 1); setN(v); setNRaw(String(v)); }}
              disabled={n <= 1}
            >−</button>
            <input
              type="number"
              min={1}
              max={10}
              value={nRaw}
              onChange={(e) => setNRaw(e.target.value)}
              onBlur={(e) => {
                const parsed = parseInt(e.target.value, 10);
                const clamped = isNaN(parsed) ? n : Math.max(1, Math.min(10, parsed));
                setN(clamped);
                setNRaw(String(clamped));
              }}
              className="border rounded px-2 py-1 w-16 text-center"
            />
            <button
              type="button"
              className="w-9 h-9 rounded bg-gray-200 hover:bg-gray-300 text-lg font-bold disabled:opacity-40"
              onClick={() => { const v = Math.min(10, n + 1); setN(v); setNRaw(String(v)); }}
              disabled={n >= 10}
            >+</button>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
            onClick={() => onCreate(n)}
            disabled={loading}
          >
            {loading ? "Creating..." : "Create"}
          </button>
          <button className="text-gray-500 px-3 py-2 underline" onClick={() => setView("choose")}>
            Back
          </button>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>
    );
  }

  if (view === "join") {
    return (
      <div className="space-y-4">
        <h2 className="font-semibold text-lg">Join Party</h2>
        <input
          type="text"
          placeholder="6-character code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          maxLength={6}
          className="border rounded px-2 py-1 w-40 uppercase tracking-widest font-mono"
        />
        <div className="flex gap-2">
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
            onClick={() => onJoin(code)}
            disabled={loading || code.length !== 6}
          >
            {loading ? "Joining..." : "Join"}
          </button>
          <button className="text-gray-500 px-3 py-2 underline" onClick={() => setView("choose")}>
            Back
          </button>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>
    );
  }

  return null;
}
