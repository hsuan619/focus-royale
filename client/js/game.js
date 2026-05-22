import { showScreen } from './screens.js'
import { requestWakeLock, releaseWakeLock } from './wakeLock.js'
import { playAmbient, stopAmbient } from './audio.js'
import EliminationDetector from './eliminationDetector.js'

let timerInterval = null
let startTime = null
let detector = null
let currentRoomId = null
let currentSocket = null
let selfEliminated = false

export function initGameScreen(socket, roomId, startAt, playerCount, userId, durationMins = null) {
  currentSocket = socket
  currentRoomId = roomId
  selfEliminated = false
  startTime = new Date(startAt)

  document.getElementById('survivor-count').textContent = playerCount
  document.getElementById('elim-overlay').classList.add('hidden')
  document.getElementById('warning-banner').classList.add('hidden')

  // Timer
  clearInterval(timerInterval)
  const endTime = durationMins ? new Date(startTime.getTime() + durationMins * 60 * 1000) : null
  timerInterval = setInterval(() => updateTimer(endTime), 500)

  // Wake lock
  requestWakeLock()

  // Audio: start with rain
  document.querySelectorAll('.audio-btn').forEach(btn => {
    btn.classList.remove('active')
    if (btn.dataset.sound === 'mute') btn.classList.add('active')
  })
  document.querySelectorAll('.audio-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.audio-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      if (btn.dataset.sound === 'mute') stopAmbient()
      else playAmbient(btn.dataset.sound)
    }
  })

  // Elimination detector
  if (detector) detector.stop()
  detector = new EliminationDetector({
    onEliminated: () => {
      if (selfEliminated) return
      selfEliminated = true
      sendElimination(roomId)
      showEliminatedOverlay()
    },
    onWarning: (secs) => {
      const banner = document.getElementById('warning-banner')
      banner.classList.remove('hidden')
      banner.classList.add('active')
      document.getElementById('warning-secs').textContent = secs
      let remaining = secs
      const t = setInterval(() => {
        remaining--
        document.getElementById('warning-secs').textContent = remaining
        if (remaining <= 0) clearInterval(t)
      }, 1000)
    },
    onWarningCancelled: () => {
      const banner = document.getElementById('warning-banner')
      banner.classList.add('hidden')
      banner.classList.remove('active')
    },
  })
  detector.start()
}

export function updateSurvivorCount(count) {
  document.getElementById('survivor-count').textContent = count
}

export function addEliminationFeed(msg) {
  const feed = document.getElementById('elimination-feed')
  const item = document.createElement('div')
  item.className = 'feed-item'
  item.textContent = msg
  feed.appendChild(item)
  setTimeout(() => item.remove(), 3200)
}

export function stopGame() {
  clearInterval(timerInterval)
  if (detector) { detector.stop(); detector = null }
  releaseWakeLock()
  stopAmbient()
}

function updateTimer(endTime) {
  if (!startTime) return
  const el = document.getElementById('game-timer')
  if (endTime) {
    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
    const m = String(Math.floor(remaining / 60)).padStart(2, '0')
    const s = String(remaining % 60).padStart(2, '0')
    el.textContent = `${m}:${s}`
  } else {
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0')
    const s = String(elapsed % 60).padStart(2, '0')
    el.textContent = `${m}:${s}`
  }
}

function sendElimination(roomId) {
  if (navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify({ roomId })], { type: 'application/json' })
    navigator.sendBeacon('/api/eliminate', blob)
  }
}

function showEliminatedOverlay() {
  const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  document.getElementById('elim-survival').textContent =
    `存活時間：${m}分${s}秒`
  document.getElementById('elim-overlay').classList.remove('hidden')
}
