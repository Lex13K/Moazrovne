import React, { useState, useEffect } from 'react'

const STORAGE_KEY = 'moazrovne_user'
const GITHUB_REPO = 'Lex13K/Moazrovne'
const BRANCH = 'main'
const TOKEN = import.meta.env.VITE_GITHUB_TOKEN

export default function App() {
  const [userId, setUserId] = useState('')
  const [allowedUsers, setAllowedUsers] = useState([])
  const [rated, setRated] = useState({})
  const [questions, setQuestions] = useState([])
  const [current, setCurrent] = useState(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [isRatingDisabled, setIsRatingDisabled] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  const unseen = questions.filter(q => !(rated[userId] || {})[q.question_id])

  function nextQuestion() {
    const q = unseen[Math.floor(Math.random() * unseen.length)]
    setCurrent(q || null)
    setShowAnswer(false)
    setIsRatingDisabled(false)
  }

  async function fetchGitHubFile(path) {
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`
    const res = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github+json"
      }
    })
    if (!res.ok) throw new Error(`Failed to fetch ${path}`)
    const json = await res.json()
    return atob(json.content)
  }

  async function fetchQuestionsFromGitHub() {
    try {
      const raw = await fetchGitHubFile('data/moazrovne_dataset.csv')
      const lines = raw.trim().split('\n').slice(1)
      const parsed = lines.map(line => {
        const [question_id, question, answer, comment, source, packet, image, author] = line.split(/,(?![^"]*"(?:(?:[^"]*"){2})*[^"]*$)/).map(x => x.replace(/^"|"$/g, '').replace(/""/g, '"'))
        return {
          question_id: parseInt(question_id),
          question,
          answer,
          comment,
          source,
          packet,
          image: image === '1' ? 1 : 0,
          author
        }
      })
      setQuestions(parsed)
    } catch (err) {
      console.error("❌ Failed to fetch questions.csv:", err)
    }
  }

  async function fetchRatingsFromGitHub(userId) {
    try {
      const raw = await fetchGitHubFile(`ratings/user_${userId}.json`)
      return JSON.parse(raw)
    } catch {
      console.warn("ℹ️ No ratings file found.")
      return {}
    }
  }

  async function fetchAllowedUsersFromGitHub() {
    try {
      const raw = await fetchGitHubFile('ratings/allowed.txt')
      const names = raw.includes(',') ? raw.split(',') : raw.split('\n')
      return names.map(n => n.trim()).filter(Boolean)
    } catch (err) {
      console.error("❌ Failed to fetch allowed.txt:", err)
      return []
    }
  }

  async function saveRatingToGitHub(userId, questionId, score) {
    const filePath = `ratings/user_${userId}.json`
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`

    let existingData = {}
    let sha = null

    try {
      const res = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/vnd.github+json"
        }
      })
      if (res.ok) {
        const json = await res.json()
        sha = json.sha
        existingData = JSON.parse(atob(json.content))
      }
    } catch {}

    existingData[questionId] = score

    const payload = {
      message: `⭐️ ${userId} rated ${questionId} with ${score}`,
      content: btoa(JSON.stringify(existingData, null, 2)),
      branch: BRANCH,
      ...(sha && { sha })
    }

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github+json"
      },
      body: JSON.stringify(payload)
    })

    if (!putRes.ok) {
      console.error("❌ Failed to save rating:", await putRes.text())
    } else {
      console.log("✅ Rating saved to GitHub.")
    }
  }

  async function rateQuestion(score) {
    if (!current || isRatingDisabled) return
    setIsRatingDisabled(true)

    const updated = {
      ...rated,
      [userId]: {
        ...(rated[userId] || {}),
        [current.question_id]: score
      }
    }

    setRated(updated)
    await saveRatingToGitHub(userId, current.question_id, score)
    setTimeout(() => nextQuestion(), 500)
  }

  async function handleLogin(name) {
    const cleaned = name.trim()
    if (!allowedUsers.includes(cleaned)) {
      setError("User not allowed. Please enter a valid name.")
      return
    }

    localStorage.setItem(STORAGE_KEY, cleaned)
    const loadedRatings = await fetchRatingsFromGitHub(cleaned)
    setRated(prev => ({ ...prev, [cleaned]: loadedRatings }))
    setUserId(cleaned)
    setError("")
  }

  useEffect(() => {
    async function initialize() {
      const [users, _] = await Promise.all([
        fetchAllowedUsersFromGitHub(),
        fetchQuestionsFromGitHub()
      ])
      setAllowedUsers(users)
      setLoading(false)

      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && users.includes(saved)) {
        await handleLogin(saved)
      }
    }

    initialize()
  }, [])

  useEffect(() => {
    if (userId && unseen.length > 0) nextQuestion()
  }, [userId, questions])

  return (
    <main className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🧠 Moazrovne Quiz</h1>

      {loading ? (
        <p>🔄 Loading...</p>
      ) : !userId ? (
        <div>
          <p className="mb-2">Enter your name:</p>
          <input
            className="border p-2 w-full"
            type="text"
            onKeyDown={e => e.key === "Enter" && handleLogin(e.target.value)}
          />
          {error && <p className="text-red-500 mt-2">{error}</p>}
        </div>
      ) : current ? (
        <div>
          <p className="mb-2 font-medium">Question #{current.question_id}</p>
          <p className="mb-4 whitespace-pre-line">{current.question}</p>
          {current.image === 1 && (
            <img
              src={`https://raw.githubusercontent.com/${GITHUB_REPO}/${BRANCH}/data/images/qid_${current.question_id}.jpg`}
              alt="Question"
              className="mb-4 rounded border"
            />
          )}
          {!showAnswer ? (
            <button
              className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
              onClick={() => setShowAnswer(true)}
            >
              Reveal Answer
            </button>
          ) : (
            <>
              <p className="mb-2"><strong>Answer:</strong> {current.answer}</p>
              {current.comment && (
                <p className="mb-4 italic text-gray-700">{current.comment}</p>
              )}
            </>
          )}
          <p className="mb-2">Rate this question:</p>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
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
          <button
            className="bg-yellow-400 text-black px-4 py-2 rounded"
            onClick={nextQuestion}
          >
            Skip
          </button>
        </div>
      ) : (
        <p className="text-green-600 font-semibold mt-10">✅ You’ve rated all questions!</p>
      )}
    </main>
  )
}
