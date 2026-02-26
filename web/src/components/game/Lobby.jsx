export default function Lobby({ party, members, profilesMap, userId, isLeader, onStartGame, onLeave, error, loading }) {
  const allMemberCount = members.length;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-gray-500 mb-1">Share this code with friends:</p>
        <p className="text-4xl font-mono font-bold tracking-widest text-indigo-600">{party?.code}</p>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-600 mb-1">
          Players ({allMemberCount}) — each picks {party?.questions_per_player} question{party?.questions_per_player !== 1 ? "s" : ""}:
        </p>
        <ul className="space-y-1">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-2 text-sm">
              <span>{profilesMap.get(m.user_id) ?? m.user_id.slice(0, 8)}</span>
              {m.user_id === party?.leader_user_id && (
                <span className="text-xs bg-yellow-100 text-yellow-800 px-1 rounded">leader</span>
              )}
              {m.user_id === userId && (
                <span className="text-xs text-gray-400">(you)</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-3">
        {isLeader && (
          <button
            className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
            onClick={onStartGame}
            disabled={loading || allMemberCount < 1}
          >
            {loading ? "Starting..." : "Start Game"}
          </button>
        )}
        {!isLeader && (
          <p className="text-sm text-gray-500 italic">Waiting for the leader to start...</p>
        )}
        <button className="text-gray-400 text-sm underline" onClick={onLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}
