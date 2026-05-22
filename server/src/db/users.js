const prisma = require('./prisma')

async function findOrCreateUser({ googleId, email, name, avatarUrl }) {
  return prisma.user.upsert({
    where: { googleId },
    update: { lastLoginAt: new Date(), name, avatarUrl },
    create: { googleId, email, name, avatarUrl },
  })
}

async function getUserById(id) {
  return prisma.user.findUnique({ where: { id } })
}

async function updateCoins(userId, delta) {
  return prisma.user.update({
    where: { id: userId },
    data: { coins: { increment: delta } },
  })
}

async function applyDailyBonus(userId) {
  const user = await getUserById(userId)
  const today = new Date().toDateString()
  const lastLogin = new Date(user.lastLoginAt).toDateString()
  if (today === lastLogin) return { applied: false }
  await prisma.user.update({
    where: { id: userId },
    data: { coins: { increment: 10 }, lastLoginAt: new Date() },
  })
  return { applied: true, coinsAdded: 10 }
}

module.exports = { findOrCreateUser, getUserById, updateCoins, applyDailyBonus }
