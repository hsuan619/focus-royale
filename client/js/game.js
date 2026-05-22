import { showScreen } from './screens.js'
import { requestWakeLock, releaseWakeLock } from './wakeLock.js'
import { playAmbient, stopAmbient } from './audio.js'
import EliminationDetector from './eliminationDetector.js'
import { elimMessage, encourageMessage } from './messages.js'

let timerInterval = null
let encourageInterval = null
let warningTick = null
let startTime = null
let detector = null
let currentRoomId = null
let currentSocket = null
let selfEliminated = false
let ytPlayer = null
let ytApiReady = false

function loadYouTubeAPI() {
  return new Promise(resolve => {
    if (ytApiReady) { resolve(); return }
    if (window.YT?.Player) { ytApiReady = true; resolve(); return }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
    window.onYouTubeIframeAPIReady = () => { ytApiReady = true; resolve() }
  })
}

function extractYouTubeId(url) {
  const m = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/)([A-Za-z0-9_-]{11})/)
  return m?.[1] ?? null
}

async function startYouTubePlayer(url) {
  const videoId = extractYouTubeId(url)
  if (!videoId) return
  await loadYouTubeAPI()
  const wrap = document.getElementById('yt-player-wrap')
  wrap.innerHTML = '<div id="yt-iframe"></div>'
  wrap.style.display = 'block'
  ytPlayer = new window.YT.Player('yt-iframe', {
    width: 64, height: 36, videoId,
    playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1 },
    events: { onReady: e => e.target.playVideo() },
  })
}

function stopYouTubePlayer() {
  if (ytPlayer) {
    try { ytPlayer.stopVideo() } catch {}
    ytPlayer = null
  }
  const wrap = document.getElementById('yt-player-wrap')
  if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = '' }
}

export function initGameScreen(socket, roomId, startAt, playerCount, userId, durationMins = null, youtubeUrl = null) {
  currentSocket = socket
  currentRoomId = roomId
  selfEliminated = false
  startTime = new Date(startAt)

  document.getElementById('survivor-count').textContent = playerCount
  document.getElementById('elim-overlay').classList.add('hidden')
  document.getElementById('warning-banner').classList.add('hidden')

  // 每 10 分鐘顯示鼓勵訊息（停留 10 秒）
  clearInterval(encourageInterval)
  encourageInterval = setInterval(() => {
    addEliminationFeed(`💬 ${encourageMessage()}`, 10000)
  }, 10 * 60 * 1000)

  // Timer
  clearInterval(timerInterval)
  const endTime = durationMins ? new Date(startTime.getTime() + durationMins * 60 * 1000) : null
  timerInterval = setInterval(() => updateTimer(endTime), 500)

  // Wake lock
  requestWakeLock()

  // Audio switcher
  const ytBtn = document.getElementById('btn-yt-sound')
  ytBtn.style.display = youtubeUrl ? 'flex' : 'none'
  stopYouTubePlayer()

  document.querySelectorAll('.audio-btn').forEach(btn => {
    btn.classList.remove('active')
    if (btn.dataset.sound === 'mute') btn.classList.add('active')
  })
  document.querySelectorAll('.audio-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.audio-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      if (btn.dataset.sound === 'youtube') {
        stopAmbient()
        startYouTubePlayer(youtubeUrl)
      } else {
        stopYouTubePlayer()
        if (btn.dataset.sound === 'mute') stopAmbient()
        else playAmbient(btn.dataset.sound)
      }
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
      if (warningTick) { clearInterval(warningTick); warningTick = null }
      const banner = document.getElementById('warning-banner')
      banner.classList.remove('hidden')
      banner.classList.add('active')
      let remaining = secs
      document.getElementById('warning-secs').textContent = remaining
      warningTick = setInterval(() => {
        remaining--
        document.getElementById('warning-secs').textContent = remaining
        if (remaining <= 0) { clearInterval(warningTick); warningTick = null }
      }, 1000)
    },
    onWarningCancelled: () => {
      if (warningTick) { clearInterval(warningTick); warningTick = null }
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

export function initPlayerList(players, selfId) {
  const el = document.getElementById('game-players')
  if (!el || !players) return
  el.innerHTML = players.map(p =>
    `<span class="game-player-tag${p.userId === selfId ? ' self' : ''}" data-uid="${p.userId}">${(p.name || 'PLAYER').toUpperCase()}</span>`
  ).join('')
}

export function markPlayerEliminated(userId) {
  const el = document.querySelector(`#game-players [data-uid="${userId}"]`)
  if (el) el.classList.add('eliminated')
}

export function addEliminationFeed(msg, duration = 3200) {
  const feed = document.getElementById('elimination-feed')
  const item = document.createElement('div')
  item.className = 'feed-item'
  item.textContent = msg
  feed.appendChild(item)
  setTimeout(() => item.remove(), duration)
}

export function stopGame() {
  clearInterval(timerInterval)
  clearInterval(encourageInterval)
  if (warningTick) { clearInterval(warningTick); warningTick = null }
  if (detector) { detector.stop(); detector = null }
  releaseWakeLock()
  stopAmbient()
  stopYouTubePlayer()
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

export function showEliminatedOverlay() {
  const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  document.getElementById('elim-survival').textContent = `存活時間：${m}分${s}秒`
  document.getElementById('elim-overlay').classList.remove('hidden')
}
