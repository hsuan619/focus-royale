const prisma = require('../db/prisma')
const { getRoomState, removePlayer, getPlayerCount } = require('../db/roomState')

async function eliminatePlayer(io, userId, roomId, reason) {
  const state = await getRoomState(roomId)
  if (!state || state.status !== 'ACTIVE') return

  const session = await prisma.gameSession.findUnique({
    where: { userId_roomId: { userId, roomId } },
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

  io.to(roomId).emit('player_eliminated', { userId, survivorCount, totalCount, reason })
}

module.exports = { eliminatePlayer }
