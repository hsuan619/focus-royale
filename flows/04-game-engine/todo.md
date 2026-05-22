# Flow 04 — 遊戲引擎

**狀態**：⬜ 未開始
**前置依賴**：Flow 03
**目標**：實作前端的淘汰偵測邏輯（Page Visibility + blur 緩衝）與後端的斷線緩衝（10 秒重連），完成從偵測到伺服器記錄淘汰的完整流程。

---

## 1. 前端：偵測模組

- [ ] 建立 `client/js/eliminationDetector.js`
- [ ] 實作核心狀態機
  ```js
  class EliminationDetector {
    constructor({ onEliminated, onWarning, onWarningCancelled }) {
      this.onEliminated = onEliminated
      this.onWarning = onWarning
      this.onWarningCancelled = onWarningCancelled
      this.blurTimer = null
      this.eliminated = false
    }

    start() {
      document.addEventListener('visibilitychange', this._onVisibility.bind(this))
      window.addEventListener('blur', this._onBlur.bind(this))
      window.addEventListener('focus', this._onFocus.bind(this))
    }

    stop() {
      document.removeEventListener('visibilitychange', this._onVisibility.bind(this))
      window.removeEventListener('blur', this._onBlur.bind(this))
      window.removeEventListener('focus', this._onFocus.bind(this))
      clearTimeout(this.blurTimer)
    }

    _onVisibility() {
      if (document.visibilityState === 'hidden') {
        clearTimeout(this.blurTimer)
        this._eliminate()
      }
    }

    _onBlur() {
      if (this.eliminated) return
      this.blurTimer = setTimeout(() => {
        // 5 秒後仍未 focus 且頁面可見 → 視為系統中斷未返回
        if (document.visibilityState === 'visible') this._eliminate()
      }, 5000)
      this.onWarning(5)
    }

    _onFocus() {
      if (this.blurTimer) {
        clearTimeout(this.blurTimer)
        this.blurTimer = null
        this.onWarningCancelled()
      }
    }

    _eliminate() {
      if (this.eliminated) return
      this.eliminated = true
      this.stop()
      this.onEliminated()
    }
  }

  export default EliminationDetector
  ```

---

## 2. 前端：淘汰封包發送

- [ ] 建立 `client/js/gameClient.js`
- [ ] 連線至 Socket.io，暴露 `sendElimination()` 方法
  ```js
  import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js'

  class GameClient {
    constructor(token) {
      this.socket = io({ auth: { token } })
    }

    joinRoom(roomId) {
      this.socket.emit('join_room', { roomId })
    }

    sendElimination() {
      // 優先用 HTTP POST（不依賴 WS 連線存活）
      navigator.sendBeacon('/api/eliminate', JSON.stringify({ roomId: this.roomId }))
    }

    on(event, handler) {
      this.socket.on(event, handler)
    }
  }

  export default GameClient
  ```
- [ ] `eliminationDetector.js` 的 `onEliminated` callback 呼叫 `gameClient.sendElimination()`

---

## 3. 後端：HTTP 淘汰接收端點

- [ ] 在 `server/src/routes/game.js` 新增 `POST /api/eliminate`
  ```js
  // 需 authenticate middleware
  fastify.post('/api/eliminate', { preHandler: authenticate }, async (request, reply) => {
    const { roomId } = request.body
    const userId = request.user.userId
    await eliminatePlayer(userId, roomId, 'VISIBILITY_HIDDEN')
    reply.send({ ok: true })
  })
  ```
- [ ] 建立 `server/src/game/eliminate.js`
  ```js
  async function eliminatePlayer(userId, roomId, reason) {
    const state = await getRoomState(roomId)
    if (state.status !== 'ACTIVE') return

    const now = new Date()
    const session = await prisma.gameSession.findUnique({
      where: { userId_roomId: { userId, roomId } }
    })
    if (!session || session.eliminatedAt) return // 已被淘汰

    const survivalSecs = Math.floor((now - session.joinedAt) / 1000)
    await prisma.gameSession.update({
      where: { userId_roomId: { userId, roomId } },
      data: { eliminatedAt: now, survivalSecs }
    })
    await removePlayer(roomId, userId)

    // 廣播淘汰事件給房間
    const survivorCount = await getPlayerCount(roomId)
    const totalCount = parseInt(state.totalPlayers)
    io.to(roomId).emit('player_eliminated', {
      userId,
      survivorCount,
      totalCount,
      reason
    })
  }
  module.exports = { eliminatePlayer }
  ```

---

## 4. 後端：斷線 10 秒重連緩衝

- [ ] 在 `server/src/socket/roomHandlers.js` 的 `disconnect` handler 中，針對 `ACTIVE` 狀態
  ```js
  // ACTIVE 狀態下斷線：給 10 秒重連
  const disconnectTimers = new Map() // userId → timeoutRef

  socket.on('disconnect', async () => {
    const state = await getRoomState(roomId)
    if (state.status !== 'ACTIVE') return

    io.to(roomId).emit('player_reconnecting', { userId, seconds: 10 })
    const ref = setTimeout(async () => {
      disconnectTimers.delete(userId)
      await eliminatePlayer(userId, roomId, 'DISCONNECT_TIMEOUT')
    }, 10_000)
    disconnectTimers.set(userId, ref)
  })

  // 重連時取消計時器
  socket.on('reconnect_room', async ({ roomId }) => {
    const ref = disconnectTimers.get(userId)
    if (ref) {
      clearTimeout(ref)
      disconnectTimers.delete(userId)
      io.to(roomId).emit('player_reconnected', { userId })
    }
  })
  ```

---

## 5. 測試

- [ ] 建立 `client/js/eliminationDetector.test.js`（使用 jsdom）
  - [ ] 觸發 `visibilitychange` hidden → `onEliminated` 立即被呼叫
  - [ ] 觸發 `blur` → 5 秒後 `onEliminated` 被呼叫
  - [ ] 觸發 `blur` 後馬上 `focus` → `onEliminated` 不被呼叫，`onWarningCancelled` 被呼叫
  - [ ] 觸發 `blur` → `visibilitychange` hidden（blur 計時器中途）→ `onEliminated` 只被呼叫一次
- [ ] 建立 `server/src/game/eliminate.test.js`
  - [ ] 已淘汰的玩家再次呼叫 `eliminatePlayer` → 不重複處理
  - [ ] 斷線 10 秒後 → `player_eliminated` 事件被廣播
  - [ ] 10 秒內重連 → 不被淘汰，`player_reconnected` 事件廣播
- [ ] `npx vitest run`，全部通過

---

## 6. 提交

- [ ] commit
  ```
  feat(engine): implement visibility-based elimination with blur/disconnect buffers
  ```

---

**完成後更新 overview.md 狀態為 ✅**
