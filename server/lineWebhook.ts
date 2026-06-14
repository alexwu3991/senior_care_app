import type { Express, Request, Response } from "express";
import {
  verifyLineSignature,
  sendLineMessage,
  getLineUserProfile,
  LineWebhookBody,
  LineWebhookEvent,
} from "./line";
import {
  getSeniorByLineUserId,
  updateSenior,
  logMessage,
  addPendingLineUser,
  recordSafeReportByToken,
} from "./seniorDb";

type LineUserProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

type LineWebhookProcessOptions = {
  sendReplies?: boolean;
  resolveProfile?: (lineUserId: string) => Promise<LineUserProfile | null>;
};

type LineWebhookProcessResult = {
  processed: number;
  followEvents: number;
  textMessages: number;
  pendingUsersAdded: number;
  safeReports: number;
  helpRequests: number;
};

function shouldSendReplies(options?: LineWebhookProcessOptions): boolean {
  return options?.sendReplies !== false;
}

async function resolveDisplayName(
  lineUserId: string,
  fallback: string,
  options?: LineWebhookProcessOptions
): Promise<string> {
  const profileResolver = options?.resolveProfile || getLineUserProfile;
  const profile = await profileResolver(lineUserId);
  return profile?.displayName || fallback;
}

/**
 * 處理長者回覆「我需要幫助」訊息
 */
async function handleHelpRequest(
  event: LineWebhookEvent,
  options?: LineWebhookProcessOptions
): Promise<{ handled: boolean; seniorFound: boolean }> {
  const lineUserId = event.source.userId;
  if (!lineUserId) return { handled: false, seniorFound: false };

  const senior = await getSeniorByLineUserId(lineUserId);
  if (!senior) return { handled: false, seniorFound: false };

  // 更新狀態為紅燈（緊急）
  await updateSenior(senior.id, {
    status: "red",
    lastReportTime: Date.now(),
  });

  // 記錄訊息
  await logMessage({
    seniorId: senior.id,
    direction: "inbound",
    messageText: event.message?.text || "我需要幫助",
    lineMessageId: event.message?.id,
    sentAt: event.timestamp,
  });

  // 回覆長者確認收到
  if (event.replyToken && shouldSendReplies(options)) {
    await sendLineMessage(lineUserId, [
      {
        type: "text",
        text: `${senior.name}，我們已收到您的求助訊息！志工將盡快與您聯繫，請稍候。`,
      },
    ]);
  }

  return { handled: true, seniorFound: true };
}

/**
 * 處理長者主動傳送的文字訊息
 */
async function handleTextMessage(
  event: LineWebhookEvent,
  options?: LineWebhookProcessOptions
): Promise<{
  pendingUserAdded: boolean;
  safeReport: boolean;
  helpRequest: boolean;
}> {
  const lineUserId = event.source.userId;
  if (!lineUserId || !event.message?.text) {
    return { pendingUserAdded: false, safeReport: false, helpRequest: false };
  }

  const text = event.message.text.trim();
  const senior = await getSeniorByLineUserId(lineUserId);

  if (!senior) {
    // 未綁定的用戶，記錄到待綁定清單
    const displayName = await resolveDisplayName(lineUserId, "未知用戶", options);
    addPendingLineUser(lineUserId, displayName);
    console.log(`[LINE Webhook] Unknown user ${displayName} (${lineUserId}) sent: ${text}`);
    return { pendingUserAdded: true, safeReport: false, helpRequest: false };
  }

  // 記錄訊息
  await logMessage({
    seniorId: senior.id,
    direction: "inbound",
    messageText: text,
    lineMessageId: event.message.id,
    sentAt: event.timestamp,
  });

  // 關鍵字處理
  if (text.includes("平安") || text.includes("好") || text.includes("沒事")) {
    await updateSenior(senior.id, {
      status: "green",
      lastReportTime: Date.now(),
    });

    if (event.replyToken && shouldSendReplies(options)) {
      await sendLineMessage(lineUserId, [
        {
          type: "text",
          text: `謝謝您的回覆！${senior.name}，很高興您平安，我們會繼續關心您。`,
        },
      ]);
    }

    return { pendingUserAdded: false, safeReport: true, helpRequest: false };
  } else if (text.includes("幫助") || text.includes("緊急") || text.includes("不舒服")) {
    await updateSenior(senior.id, {
      status: "red",
      lastReportTime: Date.now(),
    });

    if (event.replyToken && shouldSendReplies(options)) {
      await sendLineMessage(lineUserId, [
        {
          type: "text",
          text: `${senior.name}，我們已收到您的訊息，志工將立即與您聯繫！`,
        },
      ]);
    }

    return { pendingUserAdded: false, safeReport: false, helpRequest: true };
  }

  return { pendingUserAdded: false, safeReport: false, helpRequest: false };
}

/**
 * 處理長者加入好友事件（follow event）
 */
async function handleFollowEvent(
  event: LineWebhookEvent,
  options?: LineWebhookProcessOptions
): Promise<{ pendingUserAdded: boolean }> {
  const lineUserId = event.source.userId;
  if (!lineUserId) return { pendingUserAdded: false };

  // 取得用戶個人資料
  const displayName = await resolveDisplayName(lineUserId, "朋友", options);

  console.log(`[LINE Webhook] New follower: ${displayName} (${lineUserId})`);

  // 自動記錄到待綁定清單
  addPendingLineUser(lineUserId, displayName);

  // 發送歡迎訊息
  if (shouldSendReplies(options)) {
    await sendLineMessage(lineUserId, [
      {
        type: "text",
        text: `您好，${displayName}！感謝您加入台北長青關懷服務。\n\n我們的志工團隊會定期關心您的狀況。當您收到問候訊息時，請點擊「我很平安」按鈕讓我們知道您一切安好。\n\n如有任何需要，請直接傳訊息給我們。`,
      },
    ]);
  }

  return { pendingUserAdded: true };
}

export async function processLineWebhookBody(
  body: LineWebhookBody,
  options?: LineWebhookProcessOptions
): Promise<LineWebhookProcessResult> {
  const result: LineWebhookProcessResult = {
    processed: 0,
    followEvents: 0,
    textMessages: 0,
    pendingUsersAdded: 0,
    safeReports: 0,
    helpRequests: 0,
  };

  for (const event of body.events) {
    try {
      if (event.type === "follow") {
        const followResult = await handleFollowEvent(event, options);
        result.processed += 1;
        result.followEvents += 1;
        if (followResult.pendingUserAdded) result.pendingUsersAdded += 1;
      } else if (event.type === "message" && event.message?.type === "text") {
        const text = event.message.text?.trim() || "";
        result.processed += 1;
        result.textMessages += 1;

        if (text === "我需要幫助") {
          const helpResult = await handleHelpRequest(event, options);
          if (helpResult.handled) result.helpRequests += 1;
        } else {
          const textResult = await handleTextMessage(event, options);
          if (textResult.pendingUserAdded) result.pendingUsersAdded += 1;
          if (textResult.safeReport) result.safeReports += 1;
          if (textResult.helpRequest) result.helpRequests += 1;
        }
      }
    } catch (eventError) {
      console.error("[LINE Webhook] Error processing event:", eventError);
    }
  }

  return result;
}

export function buildLineWebhookEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/line/webhook`;
}

export function buildLineWebhookPayloadForFollow(lineUserId: string): LineWebhookBody {
  return {
    destination: process.env.LINE_CHANNEL_ID || "local-test",
    events: [
      {
        type: "follow",
        replyToken: "local-test-reply-token",
        source: {
          type: "user",
          userId: lineUserId,
        },
        timestamp: Date.now(),
        follow: {},
      },
    ],
  };
}

function renderReportResultPage(input: {
  success: boolean;
  title: string;
  message: string;
  icon: string;
  color: string;
  background: string;
}): string {
  return `
      <!DOCTYPE html>
      <html lang="zh-TW">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${input.title}</title>
        <style>
          body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: ${input.background}; }
          .card { background: white; border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 320px; }
          .icon { font-size: 64px; margin-bottom: 16px; }
          h1 { color: ${input.color}; margin: 0 0 8px; }
          p { color: #6b7280; margin: 0; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="card" data-report-success="${input.success}">
          <div class="icon">${input.icon}</div>
          <h1>${input.title}</h1>
          <p>${input.message}</p>
        </div>
      </body>
      </html>
    `;
}

/**
 * 註冊 Line Webhook 路由
 */
export function registerLineWebhook(app: Express): void {
  // Line Webhook 端點（raw body 已在 index.ts 全域設定，此處直接使用）
  app.post(
    "/api/line/webhook",
    async (req: Request, res: Response) => {
      try {
        const signature = req.headers["x-line-signature"] as string;
        const rawBody = req.body as Buffer;

        if (!signature || !rawBody) {
          res.status(400).json({ error: "Missing signature or body" });
          return;
        }

        // 驗證簽名
        const isValid = verifyLineSignature(rawBody.toString(), signature);
        if (!isValid) {
          console.warn("[LINE Webhook] Invalid signature");
          res.status(401).json({ error: "Invalid signature" });
          return;
        }

        const body: LineWebhookBody = JSON.parse(rawBody.toString());

        // 非同步處理事件（先回應 200 給 Line）
        res.status(200).json({ status: "ok" });

        await processLineWebhookBody(body);
      } catch (error) {
        console.error("[LINE Webhook] Error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // 長者平安回報端點（從 Line 快速回覆按鈕連結跳轉）
  app.get("/report/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    const result = await recordSafeReportByToken(token);

    if (!result.success) {
      res.status(404).send(
        renderReportResultPage({
          success: false,
          title: "回報連結無效",
          message: "這個連結無法對應到有效的問候紀錄，請直接回覆 Line 或聯絡志工。",
          icon: "⚠️",
          color: "#d97706",
          background: "#fffbeb",
        })
      );
      return;
    }

    res.send(
      renderReportResultPage({
        success: true,
        title: "已收到您的回報",
        message: `謝謝您，${result.senior?.name || "我們"}已知道您平安，請繼續保重身體。`,
        icon: "✅",
        color: "#16a34a",
        background: "#f0fdf4",
      })
    );
  });

  console.log("[LINE Webhook] Routes registered: POST /api/line/webhook, GET /report/:token");
}
