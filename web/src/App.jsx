import React, { useState, useEffect } from 'react'
import questions from './questions.json'

const STORAGE_KEY = 'moazrovne_user'

export default function App() {
  const [userId, setUserId] = useState('')
  const [allowedUsers, setAllowedUsers] = useState([])
  const [rated, setRated] = useState({})
  const [current, setCurrent] = useState(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [isRatingDisabled, setIsRatingDisabled] = useState(false)
  const [error, setError] = useState("")
  const [loadingRatings, setLoadingRatings] = useState(false)

  const unseen = questions.filter(q => !(rated[userId] || {})[q.question_id])

  function nextQuestion() {
    const q = unseen[Math.floor(Math.random() * unseen.length)]
    setCurrent(q || null)
    setShowAnswer(false)
    setIsRatingDisabled(false)
  }

  async function saveRatingToGitHub(userId, questionId, score) {
    const token = import.meta.env.VITE_GITHUB_TOKEN
    const filePath = `ratings/user_${userId}.json`
    const repo = "Lex13K/Moazrovne"
    const branch = "main"
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`

    let existingData = {}
    let sha = null

    try {
      const res = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json"
        }
      })
      if (res.ok) {
        const json = await res.json()
        sha = json.sha
        existingData = JSON.parse(atob(json.content))
      }
    } catch (err) {
      console.warn("ℹ️ No existing rating file — creating new.")
    }

    existingData[questionId] = score

    const payload = {
      message: `⭐️ ${userId} rated ${questionId} with ${score}`,
      content: btoa(JSON.stringify(existingData, null, 2)),
      branch,
      ...(sha && { sha })
    }

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
      },
      body: JSON.stringify(payload)
    })

    if (!putRes.ok) {
      console.error("❌ Failed to save rating:", await putRes.text())
    } else {
      console.log("✅ Rating saved to GitHub!")
    }
  }

  async function fetchRatingsFromGitHub(userId) {
    const token = import.meta.env.VITE_GITHUB_TOKEN
    const filePath = `ratings/user_${userId}.json`
    const repo = "Lex13K/Moazrovne"
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`
  
    try {
      const res = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json"
        }
      })
      if (res.ok) {
        const json = await res.json()
        const parsed = JSON.parse(atob(json.content))
        return parsed
      }
    } catch (err) {
      console.warn("ℹ️ Could not fetch existing ratings.")
    }
  
    return {}
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

    setLoadingRatings(true)
    localStorage.setItem(STORAGE_KEY, cleaned)
    const loadedRatings = await fetchRatingsFromGitHub(cleaned)
    setRated(prev => ({ ...prev, [cleaned]: loadedRatings }))
    setUserId(cleaned)
    setError("")
    setLoadingRatings(false)
  }

  // 🔁 Load allowed usernames
  useEffect(() => {
    fetch("../ratings/allowed.txt")
      .then(res => res.text())
      .then(text => {
        const raw = text.includes(',') ? text.split(',') : text.split('\n')
        const cleaned = raw.map(name => name.trim()).filter(Boolean)
        setAllowedUsers(cleaned)
      })
      .catch(err => {
        console.error("❌ Failed to load allowed users:", err)
      })
  }, [])

  // 🔁 Load last used user if valid
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && allowedUsers.includes(saved)) {
      handleLogin(saved)
    }
  }, [allowedUsers])

  useEffect(() => {
    if (userId && unseen.length > 0) nextQuestion()
  }, [userId])

  return (
    <main className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🧠 Moazrovne Quiz</h1>

      {loadingRatings ? (
        <p>🔄 Loading your progress...</p>
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
              src={`../data/images/qid_${current.question_id}.jpg`}
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
