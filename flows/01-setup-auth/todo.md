# Flow 01 — 專案初始化 & Google OAuth

**狀態**：🔄 進行中
**前置依賴**：無
**目標**：建立可運行的 Fastify 服務器，完成 Google OAuth 登入流程，發放 JWT session。

---

## 1. 專案結構初始化

- [x] 建立根目錄結構
- [x] 初始化 `server/package.json`（含 google-auth-library）
- [x] 建立 `server/.env`（參考 `.env.example`）
- [x] 建立 `server/src/app.js` — Fastify 實例與 plugin 註冊骨架
- [x] 建立 `server/src/index.js` — 啟動入口，`app.listen(PORT)`
- [x] 確認伺服器可啟動，`/health` 回傳 `{"status":"ok"}`

---

## 2. Google OAuth 設定

- [x] 前往 Google Cloud Console 建立 OAuth 2.0 Client ID
- [x] 將 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 填入 `.env`
- [x] 安裝 `google-auth-library`

---

## 3. 後端 Auth 路由

- [x] 建立 `server/src/routes/auth.js`
- [x] 實作 `GET /auth/google` — 產生 OAuth URL 並 redirect（回傳 302）
- [x] 實作 `GET /auth/google/callback` — 驗證 ID Token，發放 JWT cookie
- [x] 實作 `GET /auth/me` — 需 authenticate，無 token 回傳 401
- [x] 實作 `POST /auth/logout` — 清除 cookie

---

## 4. JWT Middleware

- [x] 建立 `server/src/middleware/authenticate.js`

---

## 5. 驗證測試

- [x] 安裝 vitest、@vitest/coverage-v8，設定 globals 模式
- [x] 建立 `server/src/routes/auth.test.js`（4 tests）
  - [x] `GET /auth/me` 無 token → 401
  - [x] `GET /auth/me` 有效 token → 200 + user payload
  - [x] `POST /auth/logout` → cookie 清除
  - [x] `GET /auth/google` → 302 redirect to Google
- [x] `npx vitest run` — 4/4 passed

---

## 6. 提交

- [ ] `git add` 並 commit
  ```
  feat(auth): setup Fastify server with Google OAuth and JWT session
  ```

---

**完成後更新 overview.md 狀態為 ✅**
