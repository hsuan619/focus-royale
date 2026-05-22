# Flow 05 — 積分 & 金幣系統

**狀態**：⬜ 未開始
**前置依賴**：Flow 04
**目標**：實作積分結算公式、金幣押注池分配，並在遊戲結束時觸發結算流程。

---

## 1. 積分計算函式

- [ ] 建立 `server/src/game/scoring.js`
  ```js
  /**
   * S_final = floor(t * B) * (1 + (N_eliminated / N_total) * alpha)
   * t: 存活分鐘數, B=10, alpha: 房間係數
   */
  function calcScore({ survivalSecs, nEliminated, nTotal, alpha }) {
    const t = survivalSecs / 60
    const B = 10
    const base = Math.floor(t * B)
    const multiplier = 1 + (nEliminated / nTotal) * alpha
    return Math.floor(base * multiplier)
  }

  module.exports = { calcScore }
  ```
- [ ] 建立 `server/src/game/scoring.test.js`
  - [ ] `calcScore({ survivalSecs: 600, nEliminated: 0, nTotal: 10, alpha: 0.5 })` → `100`（10 分鐘 × 10，無人淘汰乘數=1）
  - [ ] `calcScore({ survivalSecs: 600, nEliminated: 10, nTotal: 10, alpha: 0.5 })` → `150`（乘數=1.5）
  - [ ] `calcScore({ survivalSecs: 30, nEliminated: 5, nTotal: 10, alpha: 1.0 })` → `7`（0.5 分鐘×10=5，floor(5×1.5)=7）
  - [ ] `npx vitest run src/game/scoring.test.js`，全部通過

---

## 2. 遊戲結束觸發條件

- [ ] 在 `server/src/game/eliminate.js` 的 `eliminatePlayer` 末尾加入結束判斷
  ```js
  const survivorCount = await getPlayerCount(roomId)
  if (survivorCount <= 1) {
    await endGame(roomId)
  }
  ```
- [ ] 建立 `server/src/game/endGame.js`
  ```js
  const { calcScore } = require('./scoring')

  async function endGame(roomId) {
    const room = await prisma.room.findUnique({ where: { id: roomId } })
    const sessions = await prisma.gameSession.findMany({
      where: { roomId },
      include: { user: true }
    })
    const nTotal = sessions.length
    const now = new Date()

    // 結算每位玩家積分
    for (const session of sessions) {
      const eliminatedBefore = sessions.filter(
        s => s.eliminatedAt && s.eliminatedAt <= (session.eliminatedAt ?? now)
      ).length
      const score = calcScore({
        survivalSecs: session.survivalSecs || Math.floor((now - session.joinedAt) / 1000),
        nEliminated: eliminatedBefore,
        nTotal,
        alpha: room.alpha
      })
      await prisma.gameSession.update({
        where: { id: session.id },
        data: { scoreEarned: score }
      })
      await prisma.user.update({
        where: { id: session.userId },
        data: { totalScore: { increment: score } }
      })
    }

    await distributeCoins(roomId, room, sessions)

    await setRoomState(roomId, { status: 'ENDED' })
    await prisma.room.update({
      where: { id: roomId },
      data: { status: 'ENDED', endedAt: now }
    })

    // 廣播結算結果
    const results = await buildResults(sessions, roomId)
    io.to(roomId).emit('game_ended', { results })
  }
  ```

---

## 3. 金幣押注池分配

- [ ] 在 `endGame.js` 中實作 `distributeCoins`
  ```js
  async function distributeCoins(roomId, room, sessions) {
    if (room.stake === 0) return // 普通房不涉及金幣

    const survivors = sessions.filter(s => !s.eliminatedAt)
    const totalPool = room.stake * sessions.length

    if (survivors.length === 0) {
      // 全員淘汰（極罕見）→ 退還押金
      for (const s of sessions) {
        await updateCoins(s.userId, room.stake)
        await prisma.gameSession.update({
          where: { id: s.id },
          data: { coinsChange: 0 }
        })
      }
      return
    }

    const prize = Math.floor(totalPool / survivors.length)
    const remainder = totalPool - prize * survivors.length

    for (const s of sessions) {
      if (survivors.find(sv => sv.id === s.id)) {
        const earned = prize + (survivors[0].id === s.id ? remainder : 0) // 第一名拿餘數
        await updateCoins(s.userId, earned)
        await prisma.gameSession.update({
          where: { id: s.id },
          data: { coinsChange: earned - room.stake }
        })
      } else {
        // 淘汰者已在加入時扣除押金，coinsChange = -stake
        await prisma.gameSession.update({
          where: { id: s.id },
          data: { coinsChange: -room.stake }
        })
      }
    }
  }
  ```

---

## 4. 結算結果 API

- [ ] `GET /rooms/:id/results` — 取得房間結算結果（遊戲結束後可查詢）
  ```js
  // 回傳：排名、暱稱、存活時間、獲得積分、金幣變動
  const sessions = await prisma.gameSession.findMany({
    where: { roomId },
    include: { user: { select: { name: true, avatarUrl: true } } },
    orderBy: { scoreEarned: 'desc' }
  })
  reply.send({ results: sessions })
  ```

---

## 5. 測試

- [ ] 建立 `server/src/game/endGame.test.js`
  - [ ] 10 人房，1 人倖存 → 倖存者積分乘數最大
  - [ ] 押注房 2 人，1 人淘汰 → 倖存者拿走全池
  - [ ] 押注房 2 人，全員同時淘汰 → 退還押金
  - [ ] `npx vitest run src/game/endGame.test.js`，全部通過

---

## 6. 提交

- [ ] commit
  ```
  feat(scoring): implement score calculation, coin distribution, and game end flow
  ```

---

**完成後更新 overview.md 狀態為 ✅**
