import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerLineWebhook } from "../lineWebhook";
import { startDailyGreetingScheduler } from "../dailyGreeting";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // 必須在全域 express.json() 之前，先為 Line Webhook 路徑保存原始 body
  // 這樣才能正確計算 HMAC-SHA256 簽名驗證
  app.use("/api/line/webhook", express.raw({ type: "application/json" }));

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerLineWebhook(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    const appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${port}`;
    const hour = Number(process.env.DAILY_GREETING_HOUR || "8");
    const minute = Number(process.env.DAILY_GREETING_MINUTE || "0");
    const timeZone = process.env.DAILY_GREETING_TIME_ZONE || "Asia/Taipei";

    startDailyGreetingScheduler({ appBaseUrl, hour, minute, timeZone });
    console.log(
      `[DailyGreeting] Scheduler ready; default ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${timeZone}`
    );
  });
}

startServer().catch(console.error);
