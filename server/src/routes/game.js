const { eliminatePlayer } = require('../game/eliminate')

async function gameRoutes(fastify) {
  fastify.post('/eliminate', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { roomId } = request.body ?? {}
    if (!roomId) return reply.code(400).send({ error: 'roomId required' })
    const userId = request.user.id
    await eliminatePlayer(fastify.io, userId, roomId, 'VISIBILITY_HIDDEN')
    return reply.send({ ok: true })
  })
}

module.exports = gameRoutes
