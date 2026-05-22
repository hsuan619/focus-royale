# Flow 06 — 前端介面

**狀態**：⬜ 未開始
**前置依賴**：Flow 01（Auth API），可與 Flow 03~05 平行進行
**目標**：實作手機優先的 True Black 深色介面，整合 Screen Wake Lock、noSleep.js 降級、Howler.js 環境音，以及完整的遊戲狀態顯示。

---

## 1. 基礎 HTML 結構

- [ ] 建立 `client/index.html`
  ```html
  <!DOCTYPE html>
  <html lang="zh-Hant">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="theme-color" content="#000000">
    <title>專注力大逃殺</title>
    <link rel="stylesheet" href="css/main.css">
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-black text-white min-h-screen">
    <div id="app"></div>
    <script type="module" src="js/main.js"></script>
  </body>
  </html>
  ```
- [ ] 建立 `client/css/main.css`（僅補 Tailwind 不足的部分）
  ```css
  body { background: #000000; }
  .glow-text { text-shadow: 0 0 12px rgba(255,255,255,0.6); }
  ```

---

## 2. 畫面狀態管理

- [ ] 建立 `client/js/screens.js` — 控制哪個畫面顯示
  ```js
  const screens = {
    login: document.getElementById('screen-login'),
    lobby: document.getElementById('screen-lobby'),
    countdown: document.getElementById('screen-countdown'),
    game: document.getElementById('screen-game'),
    result: document.getElementById('screen-result'),
  }

  function showScreen(name) {
    Object.values(screens).forEach(el => el.classList.add('hidden'))
    screens[name].classList.remove('hidden')
  }

  export { showScreen }
  ```
- [ ] 在 `index.html` 中加入五個 screen div（皆帶 `hidden` class）：
  - `#screen-login`、`#screen-lobby`、`#screen-countdown`、`#screen-game`、`#screen-result`

---

## 3. 登入畫面

- [ ] 在 `#screen-login` 中加入
  ```html
  <div class="flex flex-col items-center justify-center h-screen gap-8 px-6">
    <h1 class="text-3xl font-bold tracking-widest glow-text">專注力大逃殺</h1>
    <p class="text-gray-400 text-sm text-center">將手機放上桌，保持螢幕常亮，最後存活者勝</p>
    <a href="/auth/google"
       class="flex items-center gap-3 bg-white text-black px-6 py-3 rounded-full font-medium">
      <img src="/img/google-logo.svg" class="w-5 h-5"> 使用 Google 登入
    </a>
  </div>
  ```
- [ ] 下載 Google Logo SVG 放至 `client/img/google-logo.svg`

---

## 4. 大廳畫面

- [ ] `#screen-lobby` 顯示：用戶資訊（頭像、暱稱、金幣）+ 房間清單 + 建立/加入按鈕
  ```html
  <div class="p-4 flex flex-col gap-4">
    <div id="user-info" class="flex items-center gap-3">
      <img id="user-avatar" class="w-10 h-10 rounded-full">
      <div>
        <p id="user-name" class="font-medium"></p>
        <p id="user-coins" class="text-yellow-400 text-sm"></p>
      </div>
    </div>
    <button id="btn-create-room"
            class="w-full py-3 bg-white text-black rounded-xl font-bold">
      建立新房間
    </button>
    <div id="room-list" class="flex flex-col gap-2"></div>
  </div>
  ```
- [ ] 在 `client/js/lobby.js` 中：載入時呼叫 `GET /rooms`，渲染房間清單
- [ ] 點擊「建立新房間」→ 呼叫 `POST /rooms`，拿到 roomId 後 socket emit `join_room`

---

## 5. 倒數畫面

- [ ] `#screen-countdown` 顯示大倒數數字 + 已加入玩家數
  ```html
  <div class="flex flex-col items-center justify-center h-screen gap-6">
    <p class="text-gray-400">等待開局中...</p>
    <p id="countdown-number" class="text-8xl font-mono font-bold glow-text">60</p>
    <p id="player-count" class="text-gray-400"></p>
  </div>
  ```
- [ ] Socket 事件 `countdown_start` → `showScreen('countdown')`，啟動前端倒數計時器（僅顯示用，實際開局由伺服器決定）
- [ ] Socket 事件 `player_joined` / `player_left` → 更新 `#player-count`
- [ ] Socket 事件 `countdown_cancelled` → 返回 `showScreen('lobby')`

---

## 6. 遊戲畫面

- [ ] `#screen-game` 設計為極簡：大片黑色背景 + 存活人數 + 計時器 + 警告提示區
  ```html
  <div class="flex flex-col items-center justify-center h-screen gap-4">
    <div id="warning-banner" class="hidden w-full bg-red-900 text-white text-center py-2 fixed top-0">
      ⚠️ 偵測到系統中斷，請於 <span id="warning-countdown">5</span> 秒內返回
    </div>
    <p class="text-gray-600 text-xs tracking-widest uppercase">FOCUS MODE</p>
    <p id="game-timer" class="text-6xl font-mono text-white glow-text">00:00</p>
    <p id="survivor-count" class="text-gray-400 text-sm"></p>
    <div id="elimination-feed" class="absolute bottom-4 left-0 right-0 px-4 text-gray-600 text-xs text-center"></div>
  </div>
  ```
- [ ] Socket 事件 `game_start` → `showScreen('game')`，啟動本地計時器，初始化 `EliminationDetector`
- [ ] Socket 事件 `player_eliminated` → 更新 `#survivor-count`，在 `#elimination-feed` 插入淘汰通知
- [ ] `EliminationDetector.onWarning` → 顯示 `#warning-banner`，倒數 5 秒
- [ ] `EliminationDetector.onWarningCancelled` → 隱藏 `#warning-banner`
- [ ] `EliminationDetector.onEliminated` → 呼叫 `gameClient.sendElimination()`，顯示「你已被淘汰」overlay

---

## 7. Screen Wake Lock + noSleep.js 降級

- [ ] 建立 `client/js/wakeLock.js`
  ```js
  let wakeLockRef = null

  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef = await navigator.wakeLock.request('screen')
        return
      } catch {}
    }
    // Fallback: noSleep.js
    const { default: NoSleep } = await import('https://esm.sh/nosleep.js')
    const noSleep = new NoSleep()
    document.addEventListener('click', () => noSleep.enable(), { once: true })
  }

  async function releaseWakeLock() {
    if (wakeLockRef) { await wakeLockRef.release(); wakeLockRef = null }
  }

  export { requestWakeLock, releaseWakeLock }
  ```
- [ ] 在 `game_start` 事件後呼叫 `requestWakeLock()`
- [ ] 在 `game_ended` / 淘汰後呼叫 `releaseWakeLock()`

---

## 8. 環境音（Howler.js）

- [ ] 下載環境音檔至 `client/audio/`：`rain.mp3`、`fireplace.mp3`（可用 freesound.org 免費素材）
- [ ] 建立 `client/js/audio.js`
  ```js
  import { Howl } from 'https://esm.sh/howler'

  const sounds = {
    rain: new Howl({ src: ['/audio/rain.mp3'], loop: true, volume: 0.4 }),
    fireplace: new Howl({ src: ['/audio/fireplace.mp3'], loop: true, volume: 0.4 }),
  }

  let current = null

  function playAmbient(type) {
    if (current) current.fade(0.4, 0, 1000)
    current = sounds[type]
    current.play()
    current.fade(0, 0.4, 1000)
  }

  function stopAmbient() {
    if (current) current.fade(0.4, 0, 1000)
  }

  export { playAmbient, stopAmbient }
  ```
- [ ] 在遊戲畫面右上角加入音效切換按鈕（雨聲/營火/靜音），點擊呼叫 `playAmbient` / `stopAmbient`

---

## 9. 結算畫面

- [ ] `#screen-result` 顯示玩家排名、存活時間、獲得積分、金幣變動
  ```html
  <div class="flex flex-col h-screen p-4 gap-4">
    <h2 class="text-xl font-bold text-center pt-6">結算</h2>
    <div id="result-self" class="bg-gray-900 rounded-xl p-4"><!-- 自身結果 --></div>
    <div id="result-list" class="flex flex-col gap-2 overflow-y-auto"><!-- 排行 --></div>
    <button id="btn-back-lobby" class="w-full py-3 bg-white text-black rounded-xl font-bold mt-auto">
      返回大廳
    </button>
  </div>
  ```
- [ ] Socket 事件 `game_ended` → `showScreen('result')`，呼叫 `GET /rooms/:id/results` 渲染排名

---

## 10. 整合測試（手動）

- [ ] 用兩支手機（或一台手機 + 一個瀏覽器分頁）同時加入同一房間
- [ ] 確認 60 秒倒數開始，`game_start` 觸發
- [ ] 一支手機按 Home 鍵 → 確認被淘汰，另一支收到淘汰通知
- [ ] 確認螢幕未休眠（Wake Lock 生效）
- [ ] 確認環境音正常播放

---

## 11. 提交

- [ ] commit
  ```
  feat(ui): implement OLED dark UI with wake lock, ambient audio, and all game screens
  ```

---

**完成後更新 overview.md 狀態為 ✅**
