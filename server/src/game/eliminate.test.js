import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import prisma from '../db/prisma.js'
import redis from '../db/redis.js'
import { setRoomState, addPlayer } from '../db/roomState.js'
import { eliminatePlayer } from './eliminate.js'
import { disconnectTimers } from '../socket/roomHandlers.js'

async function createUser(suffix = '') {
  return prisma.user.create({
    data: {
      googleId: `google-elim-${suffix}-${Date.now()}`,
      email: `elim${suffix}${Date.now()}@test.com`,
      name: `Elim ${suffix}`,
      coins: 100,
    },
  })
}

async function createActiveRoom(playerIds) {
  const room = await prisma.room.create({
    data: { mode: 'NORMAL', stake: 0, alpha: 0.5, status: 'ACTIVE', startedAt: new Date() },
  })
  await setRoomState(room.id, { status: 'ACTIVE', totalPlayers: playerIds.length })
  for (const uid of playerIds) {
    await addPlayer(room.id, uid)
    await prisma.gameSession.create({ data: { userId: uid, roomId: room.id } })
  }
  return room
}

function makeMockIo() {
  const emit = vi.fn()
  return { io: { to: () => ({ emit }) }, emit }
}

afterAll(async () => {
  await prisma.$disconnect()
  redis.disconnect()
})

describe('eliminatePlayer', () => {
  it('already-eliminated player is not processed again', async () => {
    const u = await createUser('dup')
    const room = await createActiveRoom([u.id])
    const { io } = makeMockIo()

    await eliminatePlayer(io, u.id, room.id, 'TEST')
    await eliminatePlayer(io, u.id, room.id, 'TEST')

    const sessions = await prisma.gameSession.findMany({ where: { userId: u.id, roomId: room.id } })
    expect(sessions).toHaveLength(1)
    expect(sessions[0].eliminatedAt).not.toBeNull()
  })

  it('disconnect 10s timeout triggers player_eliminated', async () => {
    const u = await createUser('dc')
    const room = await createActiveRoom([u.id])
    const { io, emit } = makeMockIo()

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    let timerCallback
    const ref = setTimeout(async () => {
      disconnectTimers.delete(u.id)
      timerCallback = eliminatePlayer(io, u.id, room.id, 'DISCONNECT_TIMEOUT')
      await timerCallback
    }, 10_000)
    disconnectTimers.set(u.id, ref)

    vi.advanceTimersByTime(10_000)
    vi.useRealTimers()
    // Wait for the async eliminatePlayer to finish
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(emit).toHaveBeenCalledWith('player_eliminated', expect.objectContaining({
      userId: u.id,
      reason: 'DISCONNECT_TIMEOUT',
    }))
  })

  it('reconnect within 10s cancels elimination timer', () => {
    vi.useFakeTimers()
    const userId = 'test-reconnect-user'
    const onElim = vi.fn()

    const ref = setTimeout(() => {
      disconnectTimers.delete(userId)
      onElim()
    }, 10_000)
    disconnectTimers.set(userId, ref)

    // Reconnect at 5s
    vi.advanceTimersByTime(5_000)
    const timerRef = disconnectTimers.get(userId)
    if (timerRef) { clearTimeout(timerRef); disconnectTimers.delete(userId) }

    vi.advanceTimersByTime(10_000)
    expect(onElim).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
