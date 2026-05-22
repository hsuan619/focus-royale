const { registerRoomHandlers } = require('./roomHandlers')

function registerSocketHandlers(io, fastify) {
  io.on('connection', (socket) => {
    registerRoomHandlers(io, socket, fastify)
  })
}

module.exports = { registerSocketHandlers }
