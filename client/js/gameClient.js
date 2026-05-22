import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js'

class GameClient {
  constructor(token) {
    this.token = token
    this.roomId = null
    this.socket = io({ auth: { token } })
  }

  joinRoom(roomId) {
    this.roomId = roomId
    this.socket.emit('join_room', { roomId, token: this.token })
  }

  reconnectRoom(roomId) {
    this.roomId = roomId
    this.socket.emit('reconnect_room', { roomId, token: this.token })
  }

  sendElimination() {
    if (!this.roomId) return
    navigator.sendBeacon('/api/eliminate', JSON.stringify({ roomId: this.roomId }))
  }

  on(event, handler) {
    this.socket.on(event, handler)
  }
}

export default GameClient
