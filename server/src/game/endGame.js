const prisma = require('../db/prisma')
const { setRoomState } = require('../db/roomState')
const { updateCoins } = require('../db/users')
const { calcScore } = require('./scoring')

async function endGame(io, roomId) {
  const room = await prisma.room.findUnique({ where: { id: roomId } })
  if (!room || room.status === 'ENDED') return

  const { clearDurationTimer } = require('../socket/countdown')
  clearDurationTimer(roomId)
  const sessions = await prisma.gameSession.findMany({
    where: { roomId },
    include: { user: true },
  })

  const nTotal = sessions.length
  const now = new Date()

  for (const session of sessions) {
    const eliminatedBefore = sessions.filter(
      (s) => s.eliminatedAt && s.eliminatedAt < (session.eliminatedAt ?? now)
    ).length
    const survivalSecs = session.survivalSecs ?? Math.floor((now - new Date(session.joinedAt)) / 1000)
    const score = calcScore({ survivalSecs, nEliminated: eliminatedBefore, nTotal, alpha: room.alpha })

    await prisma.gameSession.update({
      where: { id: session.id },
      data: { scoreEarned: score, survivalSecs },
    })
    await prisma.user.update({
      where: { id: session.userId },
      data: { totalScore: { increment: score } },
    })
  }

  await distributeCoins(roomId, room, sessions)

  await setRoomState(roomId, { status: 'ENDED' })
  await prisma.room.update({ where: { id: roomId }, data: { status: 'ENDED', endedAt: now } })

  const finalSessions = await prisma.gameSession.findMany({
    where: { roomId },
    include: { user: { select: { name: true, avatarUrl: true, totalScore: true } } },
    orderBy: { scoreEarned: 'desc' },
  })
  io.to(roomId).emit('game_ended', { results: finalSessions })
}

async function distributeCoins(roomId, room, sessions) {
  if (room.stake === 0) return

  const survivors = sessions.filter((s) => !s.eliminatedAt)
  const totalPool = room.stake * sessions.length

  if (survivors.length === 0) {
    for (const s of sessions) {
      await updateCoins(s.userId, room.stake)
      await prisma.gameSession.update({ where: { id: s.id }, data: { coinsChange: 0 } })
    }
    return
  }

  const prize = Math.floor(totalPool / survivors.length)
  const remainder = totalPool - prize * survivors.length

  for (const s of sessions) {
    const isSurvivor = survivors.some((sv) => sv.id === s.id)
    if (isSurvivor) {
      const isFirst = survivors[0].id === s.id
      const earned = prize + (isFirst ? remainder : 0)
      await updateCoins(s.userId, earned)
      await prisma.gameSession.update({
        where: { id: s.id },
        data: { coinsChange: earned - room.stake },
      })
    } else {
      await prisma.gameSession.update({ where: { id: s.id }, data: { coinsChange: -room.stake } })
    }
  }
}

module.exports = { endGame }
