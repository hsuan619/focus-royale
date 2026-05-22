const prisma = require('../db/prisma')
const redis = require('../db/redis')
const { getRoomState, addPlayer, removePlayer, getPlayerCount } = require('../db/roomState')
const { startCountdown, cancelCountdown } = require('./countdown')
const { eliminatePlayer } = require('../game/eliminate')

const disconnectTimers = new Map() // userId → timeoutRef

function registerRoomHandlers(io, socket, fastify) {
  socket.on('join_room', async ({ roomId, token }) => {
    let userId
    try {
      const decoded = fastify.jwt.verify(token)
      userId = decoded.id
    } catch {
      socket.emit('error', { message: 'Invalid token' })
      return
    }

    const state = await getRoomState(roomId)
    if (!state || state.status !== 'WAITING') {
      socket.emit('error', { message: 'Room not available' })
      return
    }

    const room = await prisma.room.findUnique({ where: { id: roomId } })
    if (!room) {
      socket.emit('error', { message: 'Room not found' })
      return
    }

    const currentCount = await getPlayerCount(roomId)
    if (currentCount >= room.maxPlayers) {
      socket.emit('error', { message: 'Room is full' })
      return
    }

    if (room.mode !== 'NORMAL' && room.stake > 0) {
      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user || user.coins < room.stake) {
        socket.emit('error', { message: 'Insufficient coins' })
        return
      }
      await prisma.user.update({
        where: { id: userId },
        data: { coins: { decrement: room.stake } },
      })
    }

    socket.data.userId = userId
    socket.data.roomId = roomId

    await addPlayer(roomId, userId)
    socket.join(roomId)

    const newCount = await getPlayerCount(roomId)
    io.to(roomId).emit('player_joined', { userId, playerCount: newCount })

    if (newCount >= 2) {
      await startCountdown(io, roomId)
    }
  })

  socket.on('reconnect_room', async ({ roomId, token }) => {
    let userId
    try {
      const decoded = fastify.jwt.verify(token)
      userId = decoded.id
    } catch {
      socket.emit('error', { message: 'Invalid token' })
      return
    }

    const ref = disconnectTimers.get(userId)
    if (ref) {
      clearTimeout(ref)
      disconnectTimers.delete(userId)
    }

    socket.data.userId = userId
    socket.data.roomId = roomId
    socket.join(roomId)

    io.to(roomId).emit('player_reconnected', { userId })
  })

  socket.on('disconnect', async () => {
    const { userId, roomId } = socket.data
    if (!userId || !roomId) return

    const state = await getRoomState(roomId)
    if (!state) return

    if (state.status === 'WAITING' || state.status === 'COUNTDOWN') {
      await removePlayer(roomId, userId)
      const remaining = await getPlayerCount(roomId)
      io.to(roomId).emit('player_left', { userId, playerCount: remaining })

      if (state.status === 'COUNTDOWN' && remaining < 2) {
        await cancelCountdown(io, roomId)
      }
      return
    }

    if (state.status === 'ACTIVE') {
      io.to(roomId).emit('player_reconnecting', { userId, seconds: 10 })
      const ref = setTimeout(async () => {
        disconnectTimers.delete(userId)
        await eliminatePlayer(io, userId, roomId, 'DISCONNECT_TIMEOUT')
      }, 10_000)
      disconnectTimers.set(userId, ref)
    }
  })
}

module.exports = { registerRoomHandlers, disconnectTimers }
