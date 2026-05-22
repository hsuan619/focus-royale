const prisma = require('../db/prisma')
const { setRoomState, getRoomState } = require('../db/roomState')

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
}

module.exports = roomsRoutes
