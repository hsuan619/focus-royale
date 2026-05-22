const { OAuth2Client } = require('google-auth-library')
const { findOrCreateUser, applyDailyBonus } = require('../db/users')

const REDIRECT_URI = `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/callback`

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
)

async function authRoutes(fastify) {
  // GET /auth/google — 導向 Google 授權頁
  fastify.get('/google', async (request, reply) => {
    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['email', 'profile'],
    })
    reply.redirect(url)
  })

  // GET /auth/google/callback — 換取 token，建立 session
  fastify.get('/google/callback', async (request, reply) => {
    const { code } = request.query
    if (!code) return reply.code(400).send({ error: 'Missing code' })

    const { tokens } = await client.getToken(code)
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const { sub: googleId, email, name, picture } = ticket.getPayload()

    const user = await findOrCreateUser({ googleId, email, name, avatarUrl: picture })
    await applyDailyBonus(user.id)

    const token = fastify.jwt.sign(
      { userId: user.id, googleId, email, name, avatarUrl: picture },
      { expiresIn: '7d' }
    )
    reply
      .setCookie('token', token, { httpOnly: true, path: '/', sameSite: 'lax' })
      .redirect('/')
  })

  // GET /auth/me — 取得目前登入用戶
  fastify.get('/me', { preHandler: fastify.authenticate }, async (request) => {
    return request.user
  })

  // POST /auth/logout — 清除 session
  fastify.post('/logout', async (request, reply) => {
    reply.clearCookie('token', { path: '/' }).send({ ok: true })
  })
}

module.exports = authRoutes
