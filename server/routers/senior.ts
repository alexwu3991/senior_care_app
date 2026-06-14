import { z } from "zod";
import crypto from "crypto";
import { publicProcedure, router } from "../_core/trpc";
import {
  getAllSeniors,
  getSeniorById,
  createSenior,
  updateSenior,
  deleteSenior,
  logMessage,
  reportTokenToMessageId,
  getMessagesBySeniorId,
  getPendingLineUsers,
  removePendingLineUser,
} from "../seniorDb";
import {
  sendGreetingWithReplyButton,
  sendLineMessage,
} from "../line";
import { getDailyGreetingPreview } from "../dailyGreeting";
import {
  buildLineWebhookEndpoint,
  buildLineWebhookPayloadForFollow,
  processLineWebhookBody,
} from "../lineWebhook";
import { nanoid } from "nanoid";

const HealthStatusEnum = z.enum(["良好", "慢性病", "行動不便", "需定期回診", "其他"]);
const StatusEnum = z.enum(["green", "yellow", "red", "gray"]);
const DevScenarioEnum = z.enum([
  "sentOver24h",
  "reportedOver24h",
  "normal",
  "clearLine",
]);

function assertLocalDevToolsEnabled(): void {
  const enabled =
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_LOCAL_TEST_TOOLS === "true" ||
    !process.env.DATABASE_URL;

  if (!enabled) {
    throw new Error("本機測試工具只允許在開發環境使用");
  }
}

function fakeLineUserId(id: number): string {
  return `U${String(id).padStart(32, "0").slice(0, 32)}`;
}

function fakeWebhookLineUserId(): string {
  return `U${crypto.randomBytes(16).toString("hex")}`;
}

export const seniorRouter = router({
  // 取得所有長者
  list: publicProcedure.query(async () => {
    return getAllSeniors();
  }),

  // 取得單一長者
  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getSeniorById(input.id);
    }),

  // 新增長者
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        phone: z.string().min(1),
        address: z.string().min(1),
        health: HealthStatusEnum,
        healthNote: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await createSenior({
        name: input.name,
        phone: input.phone,
        address: input.address,
        health: input.health,
        healthNote: input.healthNote ?? null,
        status: "gray",
      });
      return { id };
    }),

  // 更新長者資料
  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        health: HealthStatusEnum.optional(),
        healthNote: z.string().optional(),
        status: StatusEnum.optional(),
        lineUserId: z.string().optional(),
        lineDisplayName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateSenior(id, data);
      // 如果綁定了 lineUserId，從待綁定清單移除
      if (input.lineUserId) {
        removePendingLineUser(input.lineUserId);
      }
      return { success: true };
    }),

  // 刪除長者
  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteSenior(input.id);
      return { success: true };
    }),

  // 手動更新狀態
  updateStatus: publicProcedure
    .input(z.object({ id: z.number(), status: StatusEnum }))
    .mutation(async ({ input }) => {
      await updateSenior(input.id, { status: input.status });
      return { success: true };
    }),

  // 發送 Line 問候訊息（真實發送）
  sendLineMessage: publicProcedure
    .input(
      z.object({
        seniorId: z.number(),
        messageText: z.string().min(1),
        appBaseUrl: z.string().url(),
      })
    )
    .mutation(async ({ input }) => {
      const senior = await getSeniorById(input.seniorId);
      if (!senior) throw new Error("找不到此長者資料");
      if (!senior.lineUserId) {
        return {
          success: false,
          error: "此長者尚未綁定 Line 帳號，無法發送訊息",
          simulated: true,
          simulatedMessage: `${input.messageText}\n\n👇 點此回報平安：\n${input.appBaseUrl}/report/DEMO`,
        };
      }

      // 生成回報 Token
      const reportToken = nanoid(16);

      // 發送真實 Line 訊息
      const result = await sendGreetingWithReplyButton(
        senior.lineUserId,
        senior.name,
        input.messageText,
        reportToken,
        input.appBaseUrl
      );

      if (result.success) {
        // 更新發送時間和狀態
        await updateSenior(input.seniorId, {
          messageSentTime: Date.now(),
          status: "gray",
        });

        // 記錄訊息
        await logMessage({
          seniorId: input.seniorId,
          direction: "outbound",
          messageText: input.messageText,
          lineMessageId: reportTokenToMessageId(reportToken),
          sentAt: Date.now(),
        });
      }

      return { success: result.success, error: result.error, simulated: false };
    }),

  // 取得待綁定的 Line 用戶（已加好友但尚未綁定到長者）
  getPendingLineUsers: publicProcedure.query(() => {
    return getPendingLineUsers();
  }),

  // 取得訊息記錄
  getMessages: publicProcedure
    .input(z.object({ seniorId: z.number() }))
    .query(async ({ input }) => {
      return getMessagesBySeniorId(input.seniorId);
    }),

  // 長者回報平安（由 Webhook 或模擬呼叫）
  reportSafe: publicProcedure
    .input(z.object({ seniorId: z.number() }))
    .mutation(async ({ input }) => {
      await updateSenior(input.seniorId, {
        status: "green",
        lastReportTime: Date.now(),
      });

      await logMessage({
        seniorId: input.seniorId,
        direction: "inbound",
        messageText: "長者回報平安",
        sentAt: Date.now(),
      });

      return { success: true };
    }),

  // 本機測試工具：快速切換逾時/正常情境，不會真的發 Line
  devScenario: publicProcedure
    .input(z.object({ seniorId: z.number(), scenario: DevScenarioEnum }))
    .mutation(async ({ input }) => {
      assertLocalDevToolsEnabled();
      const now = Date.now();
      const olderThan24h = now - 25 * 60 * 60 * 1000;

      if (input.scenario === "clearLine") {
        await updateSenior(input.seniorId, {
          lineUserId: null,
          lineDisplayName: null,
          messageSentTime: null,
          lastReportTime: null,
          status: "gray",
        });
        return { success: true };
      }

      const baseLinePatch = {
        lineUserId: fakeLineUserId(input.seniorId),
        lineDisplayName: "本機測試 Line",
      };

      if (input.scenario === "sentOver24h") {
        await updateSenior(input.seniorId, {
          ...baseLinePatch,
          lastReportTime: null,
          messageSentTime: olderThan24h,
          status: "gray",
        });
        return { success: true };
      }

      if (input.scenario === "reportedOver24h") {
        await updateSenior(input.seniorId, {
          ...baseLinePatch,
          lastReportTime: olderThan24h,
          messageSentTime: now - 26 * 60 * 60 * 1000,
          status: "green",
        });
        return { success: true };
      }

      await updateSenior(input.seniorId, {
        ...baseLinePatch,
        lastReportTime: now,
        messageSentTime: now,
        status: "green",
      });
      return { success: true };
    }),

  // 本機測試工具：預覽每日問候排程會送給誰，不實際發送
  devDailyGreetingPreview: publicProcedure.query(async () => {
    assertLocalDevToolsEnabled();
    return getDailyGreetingPreview({ timeZone: "Asia/Taipei" });
  }),

  // 本機測試工具：模擬正式 Line follow webhook，驗證待綁定清單流程
  devSimulateLineWebhookFollow: publicProcedure.mutation(async () => {
    assertLocalDevToolsEnabled();

    const lineUserId = fakeWebhookLineUserId();
    const displayName = `Webhook 測試用戶 ${lineUserId.slice(-4)}`;
    const payload = buildLineWebhookPayloadForFollow(lineUserId);
    const result = await processLineWebhookBody(payload, {
      sendReplies: false,
      resolveProfile: async () => ({
        userId: lineUserId,
        displayName,
      }),
    });

    const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000";

    return {
      success: true,
      lineUserId,
      displayName,
      result,
      webhookEndpoint: buildLineWebhookEndpoint(appBaseUrl),
      signatureConfigured: Boolean(process.env.LINE_CHANNEL_SECRET),
    };
  }),

  // 本機測試工具：產生一個可點擊的平安回報連結，不實際發送 Line
  devCreateReportLink: publicProcedure
    .input(z.object({ seniorId: z.number(), appBaseUrl: z.string().url() }))
    .mutation(async ({ input }) => {
      assertLocalDevToolsEnabled();
      const senior = await getSeniorById(input.seniorId);
      if (!senior) throw new Error("找不到此長者資料");

      const reportToken = nanoid(16);
      const now = Date.now();
      await updateSenior(input.seniorId, {
        messageSentTime: now,
        status: "gray",
      });
      await logMessage({
        seniorId: input.seniorId,
        direction: "outbound",
        messageText: "本機測試問候訊息",
        lineMessageId: reportTokenToMessageId(reportToken),
        sentAt: now,
      });

      return {
        seniorId: input.seniorId,
        seniorName: senior.name,
        reportToken,
        reportUrl: `${input.appBaseUrl.replace(/\/$/, "")}/report/${reportToken}`,
      };
    }),
});
