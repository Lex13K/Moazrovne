import React, { useState, useEffect } from 'react'

const TOKEN = window.GITHUB_TOKEN
const REPO = 'Lex13K/Moazrovne'
const BRANCH = 'main'

export default function App() {
  const [userId, setUserId] = useState('')
  const [allowedUsers, setAllowedUsers] = useState([])
  const [rated, setRated] = useState({})
  const [questions, setQuestions] = useState([])
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
    const filePath = `ratings/user_${userId}.json`
    const apiUrl = `https://api.github.com/repos/${REPO}/contents/${filePath}`

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
    } catch {
      console.info("ℹ️ No ratings file found. Creating new.")
    }

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
      console.log("✅ Rating saved to GitHub!")
    }
  }

  async function fetchRatingsFromGitHub(userId) {
    const filePath = `ratings/user_${userId}.json`
    const apiUrl = `https://api.github.com/repos/${REPO}/contents/${filePath}`

    try {
      const res = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/vnd.github+json"
        }
      })
      if (res.ok) {
        const json = await res.json()
        return JSON.parse(atob(json.content))
      }
    } catch {
      console.warn("⚠️ No ratings file found for user, starting fresh.")
    }

    return {}
  }

  async function fetchQuestionsFromGitHub() {
    const filePath = "data/moazrovne_dataset.json"
    const apiUrl = `https://api.github.com/repos/${REPO}/contents/${filePath}`

    const res = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github+json"
      }
    })

    if (res.ok) {
      const json = await res.json()
      return JSON.parse(atob(json.content))
    } else {
      console.error("❌ Failed to fetch questions:", await res.text())
      return []
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

    setLoadingRatings(true)
    const loadedRatings = await fetchRatingsFromGitHub(cleaned)
    setRated(prev => ({ ...prev, [cleaned]: loadedRatings }))
    setUserId(cleaned)
    setError("")
    setLoadingRatings(false)
  }

  useEffect(() => {
    const fetchAllowedUsers = async () => {
      const filePath = "ratings/allowed.txt"
      const apiUrl = `https://api.github.com/repos/${REPO}/contents/${filePath}`

      try {
        const res = await fetch(apiUrl, {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: "application/vnd.github+json"
          }
        })

        if (res.ok) {
          const json = await res.json()
          const content = atob(json.content)
          const raw = content.includes(',') ? content.split(',') : content.split('\n')
          const cleaned = raw.map(name => name.trim()).filter(Boolean)
          setAllowedUsers(cleaned)
        }
      } catch (err) {
        console.error("❌ Failed to fetch allowed.txt:", err)
      }
    }

    fetchAllowedUsers()
  }, [])

  useEffect(() => {
    if (userId && questions.length > 0 && unseen.length > 0) {
      nextQuestion()
    }
  }, [userId, questions])

  useEffect(() => {
    fetchQuestionsFromGitHub().then(setQuestions)
  }, [])

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
              src={`https://raw.githubusercontent.com/${REPO}/${BRANCH}/data/images/qid_${current.question_id}.jpg`}
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
