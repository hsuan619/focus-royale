const prisma = require('../db/prisma')
const redis = require('../db/redis')
const { setRoomState } = require('../db/roomState')

const countdowns = new Map() // roomId → timeoutRef

async function startCountdown(io, roomId) {
  if (countdowns.has(roomId)) return

  await setRoomState(roomId, { status: 'COUNTDOWN' })
  await prisma.room.update({ where: { id: roomId }, data: { status: 'COUNTDOWN' } })
  io.to(roomId).emit('countdown_start', { seconds: 60 })

  const ref = setTimeout(async () => {
    countdowns.delete(roomId)
    await startGame(io, roomId)
  }, 60_000)
  countdowns.set(roomId, ref)
}

async function cancelCountdown(io, roomId) {
  const ref = countdowns.get(roomId)
  if (ref) {
    clearTimeout(ref)
    countdowns.delete(roomId)
  }
  await setRoomState(roomId, { status: 'WAITING' })
  await prisma.room.update({ where: { id: roomId }, data: { status: 'WAITING' } })
  io.to(roomId).emit('countdown_cancelled')
}

async function startGame(io, roomId) {
  const now = new Date()
  const players = await redis.smembers(`room:${roomId}:players`)
  await setRoomState(roomId, { status: 'ACTIVE', startAt: now.toISOString(), totalPlayers: players.length })
  await prisma.room.update({ where: { id: roomId }, data: { status: 'ACTIVE', startedAt: now } })
  await prisma.gameSession.createMany({
    data: players.map((userId) => ({ userId, roomId })),
    skipDuplicates: true,
  })

  io.to(roomId).emit('game_start', { startAt: now.toISOString(), playerCount: players.length })
}

module.exports = { startCountdown, cancelCountdown }
