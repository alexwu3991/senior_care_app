# Senior Care App Deployment

This app is a single Node/Express service that serves the Vite React frontend and the API.

## Recommended HTTPS platform: Render

Render is a good fit for this project because it can run the Node server directly and provides an HTTPS `onrender.com` URL after deployment.

This repo includes `render.yaml`, so Render can create the web service from a Blueprint.

## Before deploying

1. Push this `senior_care_app` folder to a GitHub repository.
2. Do not commit `.env`. It contains real secrets and is already ignored.
3. Keep `.env.example` for reference only.

## Render setup

1. Open the Render Dashboard.
2. Choose **New > Blueprint**.
3. Connect the GitHub repository that contains this project.
4. Select the repo and let Render read `render.yaml`.
5. Fill the secret environment variables when Render asks.

## Required production environment variables

Set these in Render. Do not put real values in Git.

```env
APP_BASE_URL=https://your-render-service.onrender.com
LINE_CHANNEL_ID=2010369139
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_CHANNEL_SECRET=...
```

Optional:

```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
DATABASE_URL=...
```

Daily greeting should stay disabled until Line sending has been tested:

```env
DAILY_GREETING_ENABLED=false
```

After testing, enable it:

```env
DAILY_GREETING_ENABLED=true
DAILY_GREETING_HOUR=8
DAILY_GREETING_MINUTE=0
DAILY_GREETING_TIME_ZONE=Asia/Taipei
```

## Data storage

The included Render config uses a persistent disk:

```env
LOCAL_DATA_PATH=/var/data/senior-store.json
```

This keeps the local JSON data across deploys and restarts. For a larger or long-term production system, use a MySQL-compatible database and set:

```env
DATABASE_URL=mysql://user:password@host:3306/database
```

Then run the Drizzle migration command before production use:

```bash
corepack pnpm run db:push
```

## LINE Console setup

After Render deploys successfully, copy the Render HTTPS URL and set the LINE webhook URL to:

```text
https://your-render-service.onrender.com/api/line/webhook
```

Then in the app, confirm the System Status panel shows:

- Line 發送: 可發送
- Webhook: 可驗證
- 測試工具: 正式隱藏

## Production smoke test

1. Open the deployed HTTPS URL.
2. Add or edit one senior.
3. Bind a real Line user.
4. Send a test greeting manually.
5. Open the Line report link and confirm the senior status becomes green.
6. Check the message history modal for outbound and inbound records.
