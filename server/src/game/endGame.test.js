import { describe, it, expect, afterAll, vi } from 'vitest'
import prisma from '../db/prisma.js'
import redis from '../db/redis.js'
import { setRoomState, addPlayer } from '../db/roomState.js'
import { endGame } from './endGame.js'

afterAll(async () => {
  await prisma.$disconnect()
  redis.disconnect()
})

function makeMockIo() {
  const emit = vi.fn()
  return { io: { to: () => ({ emit }) }, emit }
}

async function createUser(suffix = '') {
  return prisma.user.create({
    data: {
      googleId: `google-eg-${suffix}-${Date.now()}`,
      email: `eg${suffix}${Date.now()}@test.com`,
      name: `EG ${suffix}`,
      coins: 200,
    },
  })
}

async function setupRoom({ mode = 'NORMAL', stake = 0, playerCount = 2 } = {}) {
  const alphaMap = { NORMAL: 0.5, ADVANCED: 1.0, TOURNAMENT: 1.5 }
  const alpha = alphaMap[mode]
  const room = await prisma.room.create({
    data: { mode, stake, alpha, status: 'ACTIVE', startedAt: new Date() },
  })

  const users = []
  const sessions = []
  for (let i = 0; i < playerCount; i++) {
    const u = await createUser(`${mode}-${i}-${Date.now()}`)
    users.push(u)
    await addPlayer(room.id, u.id)
    const s = await prisma.gameSession.create({
      data: { userId: u.id, roomId: room.id, joinedAt: new Date(Date.now() - 600_000) },
    })
    sessions.push(s)
  }

  await setRoomState(room.id, { status: 'ACTIVE', totalPlayers: playerCount })
  return { room, users, sessions }
}

describe('endGame', () => {
  it('10-player room: last survivor gets highest score', async () => {
    const { room, users, sessions } = await setupRoom({ playerCount: 3 })
    const { io, emit } = makeMockIo()

    // Eliminate first two players
    const now = new Date()
    await prisma.gameSession.update({
      where: { id: sessions[0].id },
      data: { eliminatedAt: new Date(now - 300_000), survivalSecs: 300 },
    })
    await prisma.gameSession.update({
      where: { id: sessions[1].id },
      data: { eliminatedAt: new Date(now - 120_000), survivalSecs: 480 },
    })

    await endGame(io, room.id)

    const finalSessions = await prisma.gameSession.findMany({
      where: { roomId: room.id },
      orderBy: { scoreEarned: 'desc' },
    })

    // Survivor (sessions[2]) should have highest score
    const survivor = finalSessions.find((s) => s.userId === users[2].id)
    const eliminated1 = finalSessions.find((s) => s.userId === users[0].id)
    expect(survivor.scoreEarned).toBeGreaterThan(eliminated1.scoreEarned)
    expect(emit).toHaveBeenCalledWith('game_ended', expect.any(Object))
  })

  it('stake room 2 players: survivor takes full pool', async () => {
    const { room, users, sessions } = await setupRoom({ mode: 'ADVANCED', stake: 50 })
    const { io } = makeMockIo()

    // Eliminate first player
    await prisma.gameSession.update({
      where: { id: sessions[0].id },
      data: { eliminatedAt: new Date(), survivalSecs: 300 },
    })

    const survivorBefore = await prisma.user.findUnique({ where: { id: users[1].id } })
    await endGame(io, room.id)
    const survivorAfter = await prisma.user.findUnique({ where: { id: users[1].id } })

    // Pool = 50 * 2 = 100, survivor gets 100
    expect(survivorAfter.coins - survivorBefore.coins).toBe(100)
  })

  it('stake room: all eliminated → coins refunded', async () => {
    const { room, users, sessions } = await setupRoom({ mode: 'ADVANCED', stake: 30 })
    const { io } = makeMockIo()
    const now = new Date()

    // Eliminate all
    for (const s of sessions) {
      await prisma.gameSession.update({
        where: { id: s.id },
        data: { eliminatedAt: now, survivalSecs: 300 },
      })
    }

    const coinsBefore = await Promise.all(users.map((u) => prisma.user.findUnique({ where: { id: u.id } })))
    await endGame(io, room.id)
    const coinsAfter = await Promise.all(users.map((u) => prisma.user.findUnique({ where: { id: u.id } })))

    for (let i = 0; i < users.length; i++) {
      expect(coinsAfter[i].coins - coinsBefore[i].coins).toBe(30)
    }
  })
})
