import { showScreen } from './screens.js'

const STAKE = { NORMAL: 0, ADVANCED: 50, TOURNAMENT: 100 }
let selectedMode = 'NORMAL'
let selectedDuration = null  // null = unlimited, number = pomodoro mins
let pollInterval = null

export function initLobby(user, onJoinRoom) {
  // Render user info
  const avatar = document.getElementById('user-avatar')
  if (user.avatarUrl) { avatar.src = user.avatarUrl; avatar.style.display = 'block' }
  else avatar.style.display = 'none'
  document.getElementById('user-name').textContent = user.name?.toUpperCase() || 'PLAYER'
  document.getElementById('user-coins').textContent = `🪙 ${user.coins ?? '---'}  ⭐ ${user.totalScore ?? 0}`

  // Mode selector
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      selectedMode = btn.dataset.mode
    }
  })

  // Duration selector
  const minsInput = document.getElementById('pomodoro-mins')
  const minsLabel = document.getElementById('pomodoro-label')
  document.querySelectorAll('.dur-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      if (btn.dataset.dur === 'pomodoro') {
        selectedDuration = parseInt(minsInput.value) || 25
        minsInput.style.display = 'inline-block'
        minsLabel.style.display = 'inline'
      } else {
        selectedDuration = null
        minsInput.style.display = 'none'
        minsLabel.style.display = 'none'
      }
    }
  })
  minsInput.oninput = () => {
    selectedDuration = parseInt(minsInput.value) || 25
  }

  // Create room
  document.getElementById('btn-create-room').onclick = async () => {
    const res = await fetch('/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: selectedMode, stake: STAKE[selectedMode], durationMins: selectedDuration }),
      credentials: 'include',
    })
    if (!res.ok) return
    const { roomId } = await res.json()
    onJoinRoom(roomId)
  }

  // Logout
  document.getElementById('btn-logout').onclick = async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' })
    location.reload()
  }

  loadRooms(onJoinRoom, user.id)
  pollInterval = setInterval(() => loadRooms(onJoinRoom, user.id), 5000)
}

export function stopLobbyPoll() {
  clearInterval(pollInterval)
  pollInterval = null
}

async function loadRooms(onJoinRoom, currentUserId) {
  const list = document.getElementById('room-list')
  try {
    const res = await fetch('/rooms', { credentials: 'include' })
    const rooms = await res.json()
    if (!rooms.length) {
      list.innerHTML = '<div class="rooms-empty">沒有等待中的房間<br><br>成為第一個建立者！</div>'
      return
    }
    list.innerHTML = rooms.map(r => `
      <div class="room-card pixel-btn-outline" data-id="${r.id}">
        <div class="room-card-top">
          <span class="room-card-mode">${modeLabel(r.mode)}</span>
          ${r.stake > 0 ? `<span class="room-card-stake">🪙 ${r.stake}</span>` : ''}
          <span class="room-card-dur">${r.durationMins ? `⏱ ${r.durationMins}分` : '∞'}</span>
        </div>
        <span class="room-card-id">${r.id.slice(0, 12)}...</span>
      </div>
    `).join('')
    list.querySelectorAll('.room-card').forEach(card => {
      card.onclick = () => onJoinRoom(card.dataset.id)
    })
  } catch {
    list.innerHTML = '<div class="rooms-empty">無法載入房間</div>'
  }
}

function modeLabel(mode) {
  return { NORMAL: '普通房', ADVANCED: '進階房', TOURNAMENT: '錦標賽' }[mode] || mode
}
