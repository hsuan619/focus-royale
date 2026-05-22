const { findOrCreateUser, getUserById, updateCoins, applyDailyBonus } = require('./users')
const prisma = require('./prisma')

afterAll(async () => {
  await prisma.$disconnect()
})

describe('findOrCreateUser', () => {
  const testUser = {
    googleId: 'test-google-id-001',
    email: 'test001@example.com',
    name: 'Test User',
    avatarUrl: null,
  }

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { googleId: testUser.googleId } })
  })

  it('首次建立 → coins 預設 100', async () => {
    const user = await findOrCreateUser(testUser)
    expect(user.coins).toBe(100)
    expect(user.email).toBe(testUser.email)
  })

  it('重複呼叫 → 不重複建立', async () => {
    await findOrCreateUser(testUser)
    await findOrCreateUser(testUser)
    const count = await prisma.user.count({ where: { googleId: testUser.googleId } })
    expect(count).toBe(1)
  })
})

describe('updateCoins', () => {
  let userId

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: { googleId: 'coins-test-id', email: 'coins@example.com', name: 'Coins Test' },
    })
    userId = user.id
  })

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { id: userId } })
  })

  it('正確增加金幣', async () => {
    await updateCoins(userId, 50)
    const user = await getUserById(userId)
    expect(user.coins).toBe(150)
  })

  it('正確扣除金幣', async () => {
    await updateCoins(userId, -30)
    const user = await getUserById(userId)
    expect(user.coins).toBe(70)
  })
})

describe('applyDailyBonus', () => {
  let userId

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        googleId: 'bonus-test-id',
        email: 'bonus@example.com',
        name: 'Bonus Test',
        lastLoginAt: new Date('2000-01-01'),
      },
    })
    userId = user.id
  })

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { id: userId } })
  })

  it('上次登入非今天 → 發放 10 幣', async () => {
    const result = await applyDailyBonus(userId)
    expect(result).toEqual({ applied: true, coinsAdded: 10 })
    const user = await getUserById(userId)
    expect(user.coins).toBe(110)
  })

  it('同一天呼叫兩次 → 第二次不發放', async () => {
    await applyDailyBonus(userId)
    const result = await applyDailyBonus(userId)
    expect(result).toEqual({ applied: false })
    const user = await getUserById(userId)
    expect(user.coins).toBe(110)
  })
})
