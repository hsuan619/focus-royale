const { Server } = require('socket.io')
const app = require('./app')
const { registerSocketHandlers } = require('./socket/index')

// app.server is created at instantiation — decorate before listen
const io = new Server(app.server, { cors: { origin: '*' } })
app.decorate('io', io)
registerSocketHandlers(io, app)

const PORT = process.env.PORT || 3000
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1) }
})
