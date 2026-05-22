# Flow 03 — 房間系統

**狀態**：⬜ 未開始
**前置依賴**：Flow 01、Flow 02
**目標**：實作房間建立/加入/開局流程。最少 2 人加入後啟動 60 秒倒數，時間到自動開局；Socket.io 管理即時房間狀態廣播。

---

## 1. 安裝 Socket.io

- [ ] 安裝
  ```bash
  cd server
  npm install socket.io
  ```
- [ ] 在 `server/src/app.js` 將 Socket.io 附加至 Fastify 的 HTTP server
  ```js
  const { Server } = require('socket.io')
  const io = new Server(app.server, { cors: { origin: '*' } })
  app.decorate('io', io)
  ```
- [ ] 建立 `server/src/socket/index.js` — Socket.io 事件註冊入口
  ```js
  function registerSocketHandlers(io) {
    io.on('connection', (socket) => {
      // handlers will be attached here
    })
  }
  module.exports = { registerSocketHandlers }
  ```
- [ ] 在 `app.js` 於 `ready` 後呼叫 `registerSocketHandlers(io)`

---

## 2. 房間 HTTP API

- [ ] 建立 `server/src/routes/rooms.js`
- [ ] `POST /rooms` — 建立新房間（需 authenticate）
  ```js
  // body: { mode: 'NORMAL'|'ADVANCED'|'TOURNAMENT', stake?: number }
  // alpha map: NORMAL=0.5, ADVANCED=1.0, TOURNAMENT=1.5
  const alphaMap = { NORMAL: 0.5, ADVANCED: 1.0, TOURNAMENT: 1.5 }
  const room = await prisma.room.create({
    data: { mode, stake: stake ?? 0, alpha: alphaMap[mode] }
  })
  await setRoomState(room.id, { status: 'WAITING', playerCount: 0, alpha: alphaMap[mode], stake: stake ?? 0 })
  reply.send({ roomId: room.id })
  ```
- [ ] `GET /rooms/:id` — 取得房間基本資料（公開）
- [ ] `GET /rooms` — 列出 status=WAITING 的房間清單

---

## 3. Socket.io 加入/離開房間

- [ ] 建立 `server/src/socket/roomHandlers.js`
- [ ] 處理 `join_room` 事件
  ```js
  socket.on('join_room', async ({ roomId, token }) => {
    // 1. 驗證 JWT token，取得 userId
    // 2. 確認房間 status === 'WAITING'
    // 3. 確認 playerCount < maxPlayers
    // 4. 若 ADVANCED/TOURNAMENT：確認 user.coins >= stake，預扣押金
    // 5. addPlayer(roomId, userId)
    // 6. socket.join(roomId)
    // 7. 廣播 player_joined 給房間
    // 8. 更新 playerCount，若 >= 2 且尚未倒數 → 啟動 countdown
    io.to(roomId).emit('player_joined', { userId, playerCount })
  })
  ```
- [ ] 處理 `disconnect` 事件（WAITING 狀態中離開視為退出）
  ```js
  socket.on('disconnect', async () => {
    const roomId = await redis.get(`user:${userId}:session`)
    if (!roomId) return
    const state = await getRoomState(roomId)
    if (state.status === 'WAITING') {
      await removePlayer(roomId, userId)
      io.to(roomId).emit('player_left', { userId })
    }
    // ACTIVE 狀態的斷線由 Flow 04 處理
  })
  ```

---

## 4. 60 秒倒數開局邏輯

- [ ] 建立 `server/src/socket/countdown.js`
  ```js
  const countdowns = new Map() // roomId → timeoutRef

  async function startCountdown(io, roomId) {
    if (countdowns.has(roomId)) return // 已在倒數中，不重置
    await setRoomState(roomId, { status: 'COUNTDOWN' })
    await prisma.room.update({ where: { id: roomId }, data: { status: 'COUNTDOWN' } })
    io.to(roomId).emit('countdown_start', { seconds: 60 })

    const ref = setTimeout(async () => {
      countdowns.delete(roomId)
      await startGame(io, roomId)
    }, 60_000)
    countdowns.set(roomId, ref)
  }

  async function cancelCountdown(roomId) {
    const ref = countdowns.get(roomId)
    if (ref) { clearTimeout(ref); countdowns.delete(roomId) }
  }

  async function startGame(io, roomId) {
    const now = new Date()
    await setRoomState(roomId, { status: 'ACTIVE', startAt: now.toISOString() })
    await prisma.room.update({ where: { id: roomId }, data: { status: 'ACTIVE', startedAt: now } })
    // 建立每位玩家的 GameSession 紀錄
    const players = await redis.smembers(`room:${roomId}:players`)
    await prisma.gameSession.createMany({
      data: players.map(userId => ({ userId, roomId }))
    })
    io.to(roomId).emit('game_start', { startAt: now.toISOString(), playerCount: players.length })
  }

  module.exports = { startCountdown, cancelCountdown }
  ```
- [ ] 在 `join_room` handler 中：`playerCount >= 2` 時呼叫 `startCountdown`
- [ ] 若倒數中玩家離開導致 `playerCount < 2`：呼叫 `cancelCountdown`，`setRoomState(roomId, { status: 'WAITING' })`，廣播 `countdown_cancelled`

---

## 5. 測試

- [ ] 建立 `server/src/socket/roomHandlers.test.js`
  - [ ] 測試兩人加入 → `countdown_start` 被廣播
  - [ ] 測試一人離開（倒數中）→ `countdown_cancelled`
  - [ ] 測試 60 秒後 → `game_start` 被廣播，GameSession 已建立
  - [ ] 測試 ADVANCED 房間加入時押金不足 → 拒絕加入並回傳 error
- [ ] `npx vitest run`，全部通過

---

## 6. 提交

- [ ] commit
  ```
  feat(rooms): implement room lifecycle with Socket.io and 60s countdown
  ```

---

**完成後更新 overview.md 狀態為 ✅**
