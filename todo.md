# 獨居前賢關懷小組 App - TODO

- [x] 初始化 web-static 專案
- [x] 整合原有 React + TypeScript + TailwindCSS 應用程式
- [x] 設定 Gemini API 金鑰
- [x] 升級至 web-db-user 架構（支援後端伺服器 + 資料庫）
- [x] 設定 Line Messaging API 認證資訊（Channel ID / Secret / Access Token）
- [x] 建立資料庫 Schema（seniors 長者資料表、message_log 訊息記錄表）
- [x] 建立 Line Messaging API 服務模組（發送訊息、驗證 Webhook 簽名）
- [x] 建立長者資料 CRUD 資料庫查詢助手
- [x] 建立 tRPC 路由（長者管理、Line 訊息發送、回報平安）
- [x] 建立 Line Webhook 處理器（接收長者回覆、follow 事件）
- [x] 更新前端介面，整合 tRPC 資料庫和真實 Line 訊息發送
- [x] 新增 Line 帳號綁定功能
- [x] 新增訊息記錄功能
- [x] 通過所有測試（Line API 連線、認證驗證）
- [ ] 新增編輯長者資料功能（姓名、電話、地址、健康狀況、備註）
