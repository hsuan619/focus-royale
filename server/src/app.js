require('dotenv').config()
const path = require('path')
const fastify = require('fastify')({ logger: true })

fastify.register(require('@fastify/cors'), {
  origin: true,
  credentials: true,
})

fastify.register(require('@fastify/cookie'))

fastify.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET,
  cookie: { cookieName: 'token', signed: false },
})

const { authenticate } = require('./middleware/authenticate')
fastify.decorate('authenticate', authenticate)

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, '../../client'),
  prefix: '/',
  decorateReply: false,
})

fastify.register(require('./routes/auth'), { prefix: '/auth' })
fastify.register(require('./routes/rooms'), { prefix: '/rooms' })
fastify.register(require('./routes/game'), { prefix: '/api' })

fastify.get('/health', async () => ({ status: 'ok' }))

module.exports = fastify
