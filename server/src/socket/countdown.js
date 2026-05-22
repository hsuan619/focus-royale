const prisma = require('../db/prisma')
const redis = require('../db/redis')
const { setRoomState } = require('../db/roomState')

const countdowns = new Map()    // roomId → countdown timeoutRef
const durationTimers = new Map() // roomId → pomodoro end timeoutRef

async function startCountdown(io, roomId) {
  if (countdowns.has(roomId)) return

  await setRoomState(roomId, { status: 'COUNTDOWN', countdownStartAt: Date.now().toString() })
  await prisma.room.update({ where: { id: roomId }, data: { status: 'COUNTDOWN' } })
  io.to(roomId).emit('countdown_start', { seconds: 30 })

  const ref = setTimeout(async () => {
    countdowns.delete(roomId)
    await startGame(io, roomId)
  }, 30_000)
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
  const room = await prisma.room.findUnique({ where: { id: roomId } })

  await setRoomState(roomId, { status: 'ACTIVE', startAt: now.toISOString(), totalPlayers: players.length })
  await prisma.room.update({ where: { id: roomId }, data: { status: 'ACTIVE', startedAt: now } })
  await prisma.gameSession.createMany({
    data: players.map((userId) => ({ userId, roomId })),
    skipDuplicates: true,
  })

  const nameMap = await redis.hgetall(`room:${roomId}:names`) || {}
  const playerList = players.map(id => ({ userId: id, name: nameMap[id] || 'PLAYER' }))

  io.to(roomId).emit('game_start', {
    startAt: now.toISOString(),
    playerCount: players.length,
    durationMins: room.durationMins ?? null,
    youtubeUrl: room.youtubeUrl ?? null,
    players: playerList,
  })

  if (room.durationMins) {
    const { endGame } = require('../game/endGame')
    const ref = setTimeout(async () => {
      durationTimers.delete(roomId)
      const current = await prisma.room.findUnique({ where: { id: roomId } })
      if (current?.status === 'ACTIVE') await endGame(io, roomId)
    }, room.durationMins * 60 * 1000)
    durationTimers.set(roomId, ref)
  }
}

function clearDurationTimer(roomId) {
  const ref = durationTimers.get(roomId)
  if (ref) { clearTimeout(ref); durationTimers.delete(roomId) }
}

module.exports = { startCountdown, cancelCountdown, clearDurationTimer }
