import { showScreen } from './screens.js'
import { initLobby, stopLobbyPoll } from './lobby.js'
import { initGameScreen, updateSurvivorCount, addEliminationFeed, stopGame } from './game.js'

let socket = null
let currentUser = null
let currentToken = null
let currentRoomId = null

// ── Boot ──
async function boot() {
  let user, token
  try {
    const [meRes, tokRes] = await Promise.all([
      fetch('/auth/me', { credentials: 'include' }),
      fetch('/auth/token', { credentials: 'include' }),
    ])
    if (!meRes.ok) { showScreen('login'); return }
    user = await meRes.json()
    token = tokRes.ok ? (await tokRes.json()).token : null
  } catch {
    showScreen('login')
    return
  }

  currentUser = user
  currentToken = token

  connectSocket(token)
  initLobby(user, joinRoom)
  showScreen('lobby')
}

// ── Socket ──
function connectSocket(token) {
  // Dynamically load socket.io client from server
  const script = document.createElement('script')
  script.src = '/socket.io/socket.io.js'
  script.onload = () => {
    /* global io */
    socket = io({ auth: { token }, reconnection: true, reconnectionDelay: 1000 })

    socket.on('player_joined', ({ playerCount }) => {
      const el = document.getElementById('countdown-players')
      if (el) el.textContent = `${playerCount} 玩家加入`
    })

    socket.on('player_left', ({ playerCount }) => {
      const el = document.getElementById('countdown-players')
      if (el) el.textContent = `${playerCount} 玩家加入`
    })

    socket.on('countdown_start', ({ seconds }) => {
      showScreen('countdown')
      startCountdownUI(seconds)
    })

    socket.on('countdown_cancelled', () => {
      clearCountdownUI()
      showScreen('lobby')
    })

    socket.on('room_cancelled', () => {
      currentRoomId = null
      clearCountdownUI()
      showScreen('lobby')
      initLobby(currentUser, joinRoom)
    })

    socket.on('game_start', ({ startAt, playerCount }) => {
      clearCountdownUI()
      stopLobbyPoll()
      showScreen('game')
      initGameScreen(socket, currentRoomId, startAt, playerCount, currentUser?.id)
    })

    socket.on('player_reconnecting', ({ userId, seconds }) => {
      addEliminationFeed(`⚡ 玩家斷線，${seconds}s 重連中...`)
    })

    socket.on('player_reconnected', ({ userId }) => {
      addEliminationFeed(`✓ 玩家重新連線`)
    })

    socket.on('player_eliminated', ({ survivorCount, totalCount, userId }) => {
      updateSurvivorCount(survivorCount)
      addEliminationFeed(`💀 玩家遭淘汰  ${survivorCount}/${totalCount} 存活`)
    })

    socket.on('game_ended', async ({ results }) => {
      stopGame()
      showScreen('result')
      renderResults(results)
    })

    socket.on('reconnect', () => {
      if (currentRoomId) socket.emit('reconnect_room', { roomId: currentRoomId, token: currentToken })
    })
  }
  document.head.appendChild(script)
}

// ── Join room ──
function joinRoom(roomId) {
  if (!socket) return
  currentRoomId = roomId
  socket.emit('join_room', { roomId, token: currentToken })
  showScreen('countdown')
  document.getElementById('countdown-number').textContent = '30'
  document.getElementById('countdown-players').textContent = '1 玩家加入'

  document.getElementById('btn-cancel-room').onclick = async () => {
    await fetch(`/rooms/${roomId}`, { method: 'DELETE', credentials: 'include' })
    currentRoomId = null
    clearCountdownUI()
    showScreen('lobby')
    initLobby(currentUser, joinRoom)
  }
}

// ── Countdown UI ──
let cdInterval = null
function startCountdownUI(seconds) {
  clearCountdownUI()
  let remaining = seconds
  const numEl = document.getElementById('countdown-number')
  const barEl = document.getElementById('countdown-bar')
  numEl.textContent = remaining
  barEl.style.width = '100%'

  cdInterval = setInterval(() => {
    remaining--
    numEl.textContent = remaining
    barEl.style.width = `${(remaining / seconds) * 100}%`
    if (remaining <= 10) numEl.classList.add('glow-red')
    if (remaining <= 0) clearCountdownUI()
  }, 1000)
}

function clearCountdownUI() {
  clearInterval(cdInterval)
  cdInterval = null
  const numEl = document.getElementById('countdown-number')
  if (numEl) numEl.classList.remove('glow-red')
}

// ── Results ──
function renderResults(sessions) {
  const selfId = currentUser?.id
  const selfSession = sessions.find(s => s.userId === selfId)
  const rank = selfSession ? sessions.indexOf(selfSession) + 1 : '-'

  if (selfSession) {
    document.getElementById('result-self-score').textContent =
      `${selfSession.scoreEarned ?? 0} PTS`
    const cc = selfSession.coinsChange ?? 0
    const coinsEl = document.getElementById('result-self-coins')
    if (cc > 0) coinsEl.innerHTML = `<span class="coins-pos">+${cc} 🪙</span>`
    else if (cc < 0) coinsEl.innerHTML = `<span class="coins-neg">${cc} 🪙</span>`
    else coinsEl.innerHTML = `<span class="coins-zero">±0 🪙</span>`
    document.querySelector('.result-self-rank').textContent = `#${rank} 名`
  }

  const list = document.getElementById('result-list')
  list.innerHTML = sessions.map((s, i) => {
    const mins = Math.floor((s.survivalSecs || 0) / 60)
    const secs = (s.survivalSecs || 0) % 60
    return `
      <div class="result-row ${s.userId === selfId ? 'pixel-box' : ''}">
        <span class="result-rank">${i + 1}</span>
        <span class="result-name">${(s.user?.name || 'PLAYER').toUpperCase()}</span>
        <span class="result-time">${mins}:${String(secs).padStart(2,'0')}</span>
        <span class="result-score">${s.scoreEarned ?? 0}</span>
      </div>`
  }).join('')

  document.getElementById('btn-back-lobby').onclick = () => {
    currentRoomId = null
    showScreen('lobby')
    initLobby(currentUser, joinRoom)
  }
}

boot()
