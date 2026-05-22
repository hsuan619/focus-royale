const prisma = require('../db/prisma')
const { setRoomState, getRoomState, deleteRoomState } = require('../db/roomState')

const alphaMap = { NORMAL: 0.5, ADVANCED: 1.0, TOURNAMENT: 1.5 }

async function roomsRoutes(fastify) {
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { mode = 'NORMAL', stake = 0 } = request.body ?? {}
    if (!alphaMap[mode]) return reply.code(400).send({ error: 'Invalid mode' })

    const room = await prisma.room.create({
      data: { mode, stake, alpha: alphaMap[mode] },
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
      select: { id: true, mode: true, stake: true, maxPlayers: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(rooms)
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
