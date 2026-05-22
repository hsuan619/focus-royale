const prisma = require('../db/prisma')
const { setRoomState, getRoomState, deleteRoomState, getPlayerCount } = require('../db/roomState')

const alphaMap = { NORMAL: 0.5, ADVANCED: 1.0, TOURNAMENT: 1.5 }

async function roomsRoutes(fastify) {
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { mode = 'NORMAL', stake = 0, durationMins = null } = request.body ?? {}
    if (!alphaMap[mode]) return reply.code(400).send({ error: 'Invalid mode' })
    if (durationMins !== null && (!Number.isInteger(durationMins) || durationMins < 1 || durationMins > 180)) {
      return reply.code(400).send({ error: 'durationMins must be 1–180' })
    }

    const room = await prisma.room.create({
      data: { creatorId: request.user.id, mode, stake, alpha: alphaMap[mode], durationMins },
    })
    await setRoomState(room.id, {
      status: 'WAITING',
      playerCount: 0,
      alpha: alphaMap[mode],
      stake,
    })
    return reply.code(201).send({ roomId: room.id })
  })

  fastify.get('/', async (request, reply) => {
    const rooms = await prisma.room.findMany({
      where: { status: 'WAITING' },
      select: { id: true, mode: true, stake: true, maxPlayers: true, durationMins: true, creatorId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })

    // 過濾幽靈房間（沒有玩家的房間），同時清掉它們
    const ghostIds = []
    const liveRooms = (await Promise.all(
      rooms.map(async (r) => {
        const count = await getPlayerCount(r.id)
        if (count === 0) { ghostIds.push(r.id); return null }
        return r
      })
    )).filter(Boolean)

    if (ghostIds.length > 0) {
      await prisma.room.deleteMany({ where: { id: { in: ghostIds } } })
      await Promise.all(ghostIds.map(deleteRoomState))
    }

    return reply.send(liveRooms)
  })

  fastify.get('/:id', async (request, reply) => {
    const room = await prisma.room.findUnique({ where: { id: request.params.id } })
    if (!room) return reply.code(404).send({ error: 'Room not found' })
    const state = await getRoomState(room.id)
    return reply.send({ ...room, liveState: state })
  })

  fastify.delete('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const room = await prisma.room.findUnique({ where: { id } })
    if (!room) return reply.code(404).send({ error: 'Room not found' })
    if (room.creatorId !== request.user.id) {
      return reply.code(403).send({ error: 'Only the room creator can cancel' })
    }
    if (room.status !== 'WAITING' && room.status !== 'COUNTDOWN') {
      return reply.code(400).send({ error: 'Cannot cancel an active room' })
    }
    await prisma.room.delete({ where: { id } })
    await deleteRoomState(id)
    fastify.io.to(id).emit('room_cancelled')
    return reply.send({ ok: true })
  })

  fastify.get('/:id/results', async (request, reply) => {
    const sessions = await prisma.gameSession.findMany({
      where: { roomId: request.params.id },
      include: { user: { select: { name: true, avatarUrl: true } } },
      orderBy: { scoreEarned: 'desc' },
    })
    return reply.send({ results: sessions })
  })
}

module.exports = roomsRoutes
