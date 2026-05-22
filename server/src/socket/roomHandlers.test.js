import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { io as ioc } from 'socket.io-client'
import prisma from '../db/prisma.js'
import redis from '../db/redis.js'
import { setRoomState, addPlayer } from '../db/roomState.js'
import { registerRoomHandlers } from './roomHandlers.js'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

function makeToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET)
}

async function createTestUser(suffix = '') {
  return prisma.user.create({
    data: {
      googleId: `google-room-test-${suffix}-${Date.now()}`,
      email: `roomtest${suffix}${Date.now()}@test.com`,
      name: `Room Test ${suffix}`,
      coins: 200,
    },
  })
}

async function createTestRoom(mode = 'NORMAL', stake = 0) {
  const alphaMap = { NORMAL: 0.5, ADVANCED: 1.0, TOURNAMENT: 1.5 }
  const room = await prisma.room.create({
    data: { mode, stake, alpha: alphaMap[mode] },
  })
  await setRoomState(room.id, { status: 'WAITING', playerCount: 0, alpha: alphaMap[mode], stake })
  return room
}

let httpServer, io, port

const mockFastify = {
  jwt: { verify: (token) => jwt.verify(token, JWT_SECRET) },
}

beforeAll(async () => {
  httpServer = createServer()
  io = new Server(httpServer)
  io.on('connection', (socket) => registerRoomHandlers(io, socket, mockFastify))
  await new Promise((resolve) => httpServer.listen(0, resolve))
  port = httpServer.address().port
})

afterAll(async () => {
  io.close()
  await new Promise((resolve) => httpServer.close(resolve))
  await prisma.$disconnect()
  redis.disconnect()
})

function connect() {
  return ioc(`http://localhost:${port}`, { forceNew: true })
}

function waitFor(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve))
}

describe('join_room', () => {
  it('two players joining triggers countdown_start', async () => {
    const [u1, u2] = await Promise.all([createTestUser('a'), createTestUser('b')])
    const room = await createTestRoom()
    const c1 = connect()
    const c2 = connect()

    await Promise.all([waitFor(c1, 'connect'), waitFor(c2, 'connect')])

    c1.emit('join_room', { roomId: room.id, token: makeToken(u1.id) })
    await waitFor(c1, 'player_joined')

    const countdownPromise = waitFor(c2, 'countdown_start')
    c2.emit('join_room', { roomId: room.id, token: makeToken(u2.id) })
    const countdown = await countdownPromise

    expect(countdown.seconds).toBe(60)
    c1.disconnect()
    c2.disconnect()
  })

  it('player leaving during countdown cancels it when < 2 remain', async () => {
    const [u1, u2] = await Promise.all([createTestUser('c'), createTestUser('d')])
    const room = await createTestRoom()
    const c1 = connect()
    const c2 = connect()

    await Promise.all([waitFor(c1, 'connect'), waitFor(c2, 'connect')])

    c1.emit('join_room', { roomId: room.id, token: makeToken(u1.id) })
    await waitFor(c1, 'player_joined')

    c2.emit('join_room', { roomId: room.id, token: makeToken(u2.id) })
    await waitFor(c2, 'countdown_start')

    const cancelPromise = waitFor(c1, 'countdown_cancelled')
    c2.disconnect()
    await cancelPromise

    c1.disconnect()
  })

  it('ADVANCED room rejects join if coins < stake', async () => {
    const user = await prisma.user.create({
      data: {
        googleId: `google-broke-${Date.now()}`,
        email: `broke${Date.now()}@test.com`,
        name: 'Broke User',
        coins: 5,
      },
    })
    const room = await createTestRoom('ADVANCED', 50)
    const c = connect()
    await waitFor(c, 'connect')

    const errPromise = waitFor(c, 'error')
    c.emit('join_room', { roomId: room.id, token: makeToken(user.id) })
    const err = await errPromise

    expect(err.message).toBe('Insufficient coins')
    c.disconnect()
  })

  it('invalid token is rejected', async () => {
    const room = await createTestRoom()
    const c = connect()
    await waitFor(c, 'connect')

    const errPromise = waitFor(c, 'error')
    c.emit('join_room', { roomId: room.id, token: 'bad-token' })
    const err = await errPromise

    expect(err.message).toBe('Invalid token')
    c.disconnect()
  })
})
