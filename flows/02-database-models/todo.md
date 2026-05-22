# Flow 02 — 資料庫 & 資料模型

**狀態**：⬜ 未開始
**前置依賴**：Flow 01（Fastify 環境）
**目標**：建立 PostgreSQL schema（用戶、房間、積分）與 Redis 即時狀態結構，並完成 Prisma ORM 設定。

---

## 1. 安裝與初始化 Prisma

- [ ] 安裝 Prisma
  ```bash
  cd server
  npm install prisma @prisma/client
  npx prisma init
  ```
- [ ] 修改 `server/prisma/schema.prisma` 的 `datasource`
  ```prisma
  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }
  ```

---

## 2. PostgreSQL Schema 定義

- [ ] 在 `server/prisma/schema.prisma` 新增以下模型

  ```prisma
  model User {
    id          String   @id @default(cuid())
    googleId    String   @unique
    email       String   @unique
    name        String
    avatarUrl   String?
    coins       Int      @default(100)
    totalScore  Int      @default(0)
    createdAt   DateTime @default(now())
    lastLoginAt DateTime @default(now())
    sessions    GameSession[]
  }

  model Room {
    id          String     @id @default(cuid())
    mode        RoomMode   @default(NORMAL)
    stake       Int        @default(0)      // 押注金額（普通房為 0）
    alpha       Float      @default(0.5)    // 依 mode 決定
    maxPlayers  Int        @default(100)
    status      RoomStatus @default(WAITING)
    startedAt   DateTime?
    endedAt     DateTime?
    createdAt   DateTime   @default(now())
    sessions    GameSession[]
  }

  model GameSession {
    id            String    @id @default(cuid())
    userId        String
    roomId        String
    joinedAt      DateTime  @default(now())
    eliminatedAt  DateTime?
    survivalSecs  Int       @default(0)
    scoreEarned   Int       @default(0)
    coinsChange   Int       @default(0)     // 正=獲得，負=扣除
    user          User      @relation(fields: [userId], references: [id])
    room          Room      @relation(fields: [roomId], references: [id])

    @@unique([userId, roomId])
  }

  enum RoomMode {
    NORMAL
    ADVANCED
    TOURNAMENT
  }

  enum RoomStatus {
    WAITING
    COUNTDOWN
    ACTIVE
    ENDED
  }
  ```

- [ ] 執行 migration
  ```bash
  npx prisma migrate dev --name init
  ```
- [ ] 確認 `npx prisma studio` 可開啟並看到三張表

---

## 3. Prisma Client 封裝

- [ ] 建立 `server/src/db/prisma.js`
  ```js
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient()
  module.exports = prisma
  ```
- [ ] 建立 `server/src/db/users.js` — 用戶 CRUD
  ```js
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

  module.exports = { findOrCreateUser, getUserById, updateCoins }
  ```
- [ ] 回到 Flow 01 的 `auth.js` callback，將 `findOrCreateUser` 接入

---

## 4. Redis 即時狀態結構

- [ ] 安裝 ioredis
  ```bash
  npm install ioredis
  ```
- [ ] 建立 `server/src/db/redis.js`
  ```js
  const Redis = require('ioredis')
  const redis = new Redis(process.env.REDIS_URL)
  module.exports = redis
  ```
- [ ] 定義 Redis Key 規範（文件化在此檔頂部注釋）
  ```
  room:{roomId}:state     Hash  { status, playerCount, startAt, alpha, stake }
  room:{roomId}:players   Set   { userId, ... }
  room:{roomId}:countdown String  剩餘秒數（COUNTDOWN 狀態用）
  user:{userId}:session   String  roomId（玩家當前在哪個房間）
  ```
- [ ] 建立 `server/src/db/roomState.js` — Redis 房間狀態操作
  ```js
  const redis = require('./redis')

  async function setRoomState(roomId, state) {
    await redis.hset(`room:${roomId}:state`, state)
  }
  async function getRoomState(roomId) {
    return redis.hgetall(`room:${roomId}:state`)
  }
  async function addPlayer(roomId, userId) {
    await redis.sadd(`room:${roomId}:players`, userId)
    await redis.set(`user:${userId}:session`, roomId)
  }
  async function removePlayer(roomId, userId) {
    await redis.srem(`room:${roomId}:players`, userId)
    await redis.del(`user:${userId}:session`)
  }
  async function getPlayerCount(roomId) {
    return redis.scard(`room:${roomId}:players`)
  }

  module.exports = { setRoomState, getRoomState, addPlayer, removePlayer, getPlayerCount }
  ```

---

## 5. 每日登入金幣發放

- [ ] 在 `server/src/db/users.js` 新增
  ```js
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
  module.exports = { ..., applyDailyBonus }
  ```
- [ ] 在 `GET /auth/me` 呼叫 `applyDailyBonus(userId)` 並回傳 `dailyBonus` 欄位

---

## 6. 測試

- [ ] 建立 `server/src/db/users.test.js`
  - [ ] 測試 `findOrCreateUser` 首次建立 → coins=100
  - [ ] 測試 `findOrCreateUser` 再次呼叫 → 不重複建立
  - [ ] 測試 `applyDailyBonus` 同一天呼叫兩次 → 第二次 `applied: false`
  - [ ] 測試 `updateCoins` → 正確增減
- [ ] 執行 `npx vitest run`，全部通過

---

## 7. 提交

- [ ] commit
  ```
  feat(db): add Prisma schema, Redis state structure, and daily coin bonus
  ```

---

**完成後更新 overview.md 狀態為 ✅**
