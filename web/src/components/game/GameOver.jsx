export default function GameOver({ onLeave }) {
  return (
    <div className="space-y-4 text-center mt-10">
      <p className="text-2xl font-bold">Game Over!</p>
      <p className="text-gray-500">All questions have been played.</p>
      <button className="bg-indigo-600 text-white px-6 py-2 rounded" onClick={onLeave}>
        Back to Game Menu
      </button>
    </div>
  );
}
