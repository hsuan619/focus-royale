const prisma = require('../db/prisma')
const { getRoomState, removePlayer, getPlayerCount } = require('../db/roomState')
const { endGame } = require('./endGame')

async function eliminatePlayer(io, userId, roomId, reason) {
  const state = await getRoomState(roomId)
  if (!state || state.status !== 'ACTIVE') return

  const session = await prisma.gameSession.findUnique({
    where: { userId_roomId: { userId, roomId } },
    include: { user: { select: { name: true } } },
  })
  if (!session || session.eliminatedAt) return

  const now = new Date()
  const survivalSecs = Math.floor((now - new Date(session.joinedAt)) / 1000)

  await prisma.gameSession.update({
    where: { userId_roomId: { userId, roomId } },
    data: { eliminatedAt: now, survivalSecs },
  })
  await removePlayer(roomId, userId)

  const survivorCount = await getPlayerCount(roomId)
  const totalCount = parseInt(state.totalPlayers) || 0

  const playerName = session.user?.name || '某玩家'
  io.to(roomId).emit('player_eliminated', { userId, survivorCount, totalCount, reason, playerName })

  if (survivorCount <= 1) {
    await endGame(io, roomId)
  }
}

module.exports = { eliminatePlayer }
