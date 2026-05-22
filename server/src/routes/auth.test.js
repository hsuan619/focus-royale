const app = require('../app')
const prisma = require('../db/prisma')

let testUser

beforeAll(async () => {
  await app.ready()
  testUser = await prisma.user.create({
    data: {
      googleId: `auth-test-${Date.now()}`,
      email: `authtest${Date.now()}@example.com`,
      name: 'Test User',
    },
  })
})

afterAll(async () => {
  await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
  await app.close()
})

describe('GET /auth/me', () => {
  it('無 token 時回傳 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ error: 'Unauthorized' })
  })

  it('有效 token 時回傳 user payload', async () => {
    const token = app.jwt.sign({ id: testUser.id }, { expiresIn: '1h' })
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { token },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.email).toBe(testUser.email)
    expect(body.name).toBe('Test User')
  })
})

describe('POST /auth/logout', () => {
  it('清除 token cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/logout' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true })
    const setCookie = res.headers['set-cookie']
    expect(setCookie).toBeDefined()
    expect(setCookie).toMatch(/token=;/)
  })
})

describe('GET /auth/google', () => {
  it('redirect 到 Google OAuth URL', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/google' })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('accounts.google.com')
  })
})
