import { z } from "zod";
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import type { Senior, User } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
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
import { generateGeminiText } from "../gemini";
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
const AiFallbackTypeEnum = z.enum(["greeting", "advice"]);

function isAuthEnforced(): boolean {
  return Boolean(process.env.OAUTH_SERVER_URL && process.env.VITE_APP_ID);
}

function getManagerName(user: User): string {
  return user.name || user.email || user.openId;
}

function requireUserWhenAuthEnabled(ctx: TrpcContext): User | null {
  if (!isAuthEnforced()) return ctx.user;
  if (ctx.user) return ctx.user;
  throw new TRPCError({ code: "UNAUTHORIZED", message: "需要登入管理者帳號" });
}

function requireSignedInManager(ctx: TrpcContext): User {
  if (ctx.user) return ctx.user;
  throw new TRPCError({ code: "UNAUTHORIZED", message: "需要先登入管理者帳號" });
}

function canManageSenior(user: User | null, senior: Senior): boolean {
  if (!isAuthEnforced()) return true;
  if (!user) return false;
  if (user.role === "admin") return true;
  if (!senior.managerOpenId) return true;
  return senior.managerOpenId === user.openId;
}

async function getAccessibleSenior(id: number, ctx: TrpcContext): Promise<Senior> {
  const user = requireUserWhenAuthEnabled(ctx);
  const senior = await getSeniorById(id);
  if (!senior) throw new Error("找不到此長者資料");
  if (!canManageSenior(user, senior)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "只能管理自己關懷的長者" });
  }
  return senior;
}

function canChangeSeniorManager(user: User, senior: Senior): boolean {
  return user.role === "admin" || !senior.managerOpenId || senior.managerOpenId === user.openId;
}

function getGeminiFallbackText(type: z.infer<typeof AiFallbackTypeEnum>): string {
  if (type === "advice") {
    return "本機範本：\n• 主動確認今天是否按時用餐、喝水與服藥。\n• 關心身體是否有不舒服、跌倒或睡眠變差。\n• 若超過一天未回報，建議志工電話聯繫或安排探訪。";
  }

  return "早安！今天也請記得吃飯、喝水，照顧好身體。看到訊息後，請點一下回報平安，讓我們放心。";
}

function getTimeOfDay(): "早上" | "中午" | "晚上" {
  const hourText = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  const hour = Number(hourText);
  if (hour >= 18) return "晚上";
  if (hour >= 11) return "中午";
  return "早上";
}

function buildGreetingFallback(senior: { name: string; health: string; healthNote: string | null }): string {
  const greeting = getTimeOfDay() === "晚上" ? "晚安" : getTimeOfDay() === "中午" ? "午安" : "早安";
  const healthHint = senior.health === "良好"
    ? "今天也請記得喝水、吃飯。"
    : "今天也請留意身體狀況、按時休息。";
  return `${greeting}，${senior.name}！${healthHint}看到訊息後回報平安，讓我們放心。`;
}

function buildAdviceFallback(senior: {
  health: string;
  healthNote: string | null;
  careInterviewNote: string | null;
}): string {
  const note = senior.healthNote ? `，特別留意「${senior.healthNote}」` : "";
  const interview = senior.careInterviewNote
    ? `，並參考最近訪談：「${senior.careInterviewNote}」`
    : "";
  return [
    `• 先確認今天是否按時用餐、喝水與服藥${note}${interview}。`,
    `• 關心身體是否有不適、跌倒、睡眠變差或行動困難。`,
    `• 若超過一天未回報平安，建議志工電話聯繫或安排探訪。`,
  ].join("\n");
}

function cleanGreetingText(text: string): string {
  return text
    .replace(/```[a-zA-Z]*\n?/g, "")
    .replace(/```/g, "")
    .split("\n")
    .map(line => line.trim())
    .find(line => line.length > 0)
    ?.replace(/^\s*(?:[-*•]|\d+[.、]|[一二三][、.])\s*/g, "")
    .replace(/^(問候語|訊息|輸出|答案|以下是|好的)\s*[:：，,]?\s*/g, "")
    .replace(/^["'「『\s]+|["'」』\s]+$/g, "")
    .replace(/[。．.]{2,}/g, "。")
    .trim() || "";
}

function isUsableGreeting(text: string): boolean {
  const chineseChars = text.match(/[\u4e00-\u9fff]/g)?.length || 0;
  return (
    chineseChars >= 12 &&
    text.length <= 140 &&
    !/^[，。、！？；：,.!?;:裡了的和與]/.test(text) &&
    !/(https?:\/\/|請點擊|連結|以下是|問候語|訊息：)/.test(text)
  );
}

function cleanAdviceText(text: string): string {
  const rawLines = text
    .replace(/```[a-zA-Z]*\n?/g, "")
    .replace(/```/g, "")
    .split(/\n|(?=\s*[-*•])|(?=\d+[.、])|(?=[一二三][、.])/g)
    .map(line =>
      line
        .replace(/^\s*(?:[-*•]|\d+[.、]|[一二三][、.])\s*/g, "")
        .replace(/^(建議|注意事項)\s*[:：]?\s*/g, "")
        .trim()
    )
    .filter(line => line.length > 0 && !/^(以下|當然|好的|照護重點)/.test(line));

  return rawLines
    .slice(0, 3)
    .map(line => `• ${line.replace(/[。．.]{2,}/g, "。").replace(/[。．.]+$/g, "")}。`)
    .join("\n");
}

function isUsableAdvice(text: string): boolean {
  const lines = text.split("\n").filter(line => line.trim().startsWith("•"));
  return (
    lines.length === 3 &&
    lines.every(line => (line.match(/[\u4e00-\u9fff]/g)?.length || 0) >= 8) &&
    !/(以下是|僅供參考|身為 AI)/.test(text)
  );
}

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
  list: publicProcedure.query(async ({ ctx }) => {
    const user = requireUserWhenAuthEnabled(ctx);
    const seniors = await getAllSeniors();
    if (!isAuthEnforced() || !user || user.role === "admin") return seniors;
    return seniors.filter(senior => !senior.managerOpenId || senior.managerOpenId === user.openId);
  }),

  // 取得單一長者
  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      return getAccessibleSenior(input.id, ctx);
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
        careInterviewNote: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = requireUserWhenAuthEnabled(ctx);
      const id = await createSenior({
        name: input.name,
        phone: input.phone,
        address: input.address,
        health: input.health,
        healthNote: input.healthNote ?? null,
        careInterviewNote: input.careInterviewNote ?? null,
        managerOpenId: user?.openId ?? null,
        managerName: user ? getManagerName(user) : null,
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
        careInterviewNote: z.string().optional(),
        status: StatusEnum.optional(),
        lineUserId: z.string().optional(),
        lineDisplayName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await getAccessibleSenior(id, ctx);
      await updateSenior(id, data);
      // 如果綁定了 lineUserId，從待綁定清單移除
      if (input.lineUserId) {
        removePendingLineUser(input.lineUserId);
      }
      return { success: true };
    }),

  // 認領長者：登入管理者可將未指派或自己名下的長者歸屬到自己。
  claimManager: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const user = requireSignedInManager(ctx);
      const senior = await getSeniorById(input.id);
      if (!senior) throw new Error("找不到此長者資料");
      if (!canChangeSeniorManager(user, senior)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "此長者已由其他管理者關懷" });
      }

      await updateSenior(input.id, {
        managerOpenId: user.openId,
        managerName: getManagerName(user),
      });

      return { success: true };
    }),

  // 交回未指派：原負責管理者或 admin 可清除長者歸屬。
  releaseManager: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const user = requireSignedInManager(ctx);
      const senior = await getSeniorById(input.id);
      if (!senior) throw new Error("找不到此長者資料");
      if (!canChangeSeniorManager(user, senior)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只能交回自己關懷的長者" });
      }

      await updateSenior(input.id, {
        managerOpenId: null,
        managerName: null,
      });

      return { success: true };
    }),

  // 刪除長者
  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await getAccessibleSenior(input.id, ctx);
      await deleteSenior(input.id);
      return { success: true };
    }),

  // 手動更新狀態
  updateStatus: publicProcedure
    .input(z.object({ id: z.number(), status: StatusEnum }))
    .mutation(async ({ input, ctx }) => {
      await getAccessibleSenior(input.id, ctx);
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
    .mutation(async ({ input, ctx }) => {
      const senior = await getAccessibleSenior(input.seniorId, ctx);
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
    .query(async ({ input, ctx }) => {
      await getAccessibleSenior(input.seniorId, ctx);
      return getMessagesBySeniorId(input.seniorId);
    }),

  // AI 文字生成：由後端代理 Gemini，避免 API key 暴露在前端 bundle。
  generateAiText: publicProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(2000),
        fallbackType: AiFallbackTypeEnum,
      })
    )
    .mutation(async ({ input }) => {
      return generateGeminiText(
        input.prompt,
        getGeminiFallbackText(input.fallbackType)
      );
    }),

  generateGreeting: publicProcedure
    .input(z.object({ seniorId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const senior = await getAccessibleSenior(input.seniorId, ctx);
      const timeOfDay = getTimeOfDay();
      const fallback = buildGreetingFallback(senior);
      const prompt = [
        "你是台灣長者關懷志工，請產生一則可以直接貼到 LINE 的繁體中文問候語。",
        `長者姓名：${senior.name}`,
        `問候時段：${timeOfDay}`,
        `健康狀況：${senior.health}`,
        `健康備註：${senior.healthNote || "無"}`,
        "規則：",
        "1. 只輸出問候語正文，不要標題、編號、引號或說明。",
        "2. 請寫 2 句完整中文，至少 35 個中文字，最多 90 個中文字。",
        "3. 語氣自然溫暖，像晚輩關心長輩。",
        "4. 可以提醒喝水、吃飯、休息或留意身體。",
        "5. 不要提到點擊連結、AI、模型、以下是。",
        "6. 句子必須完整，不能從半句開始，也不能只回短句。",
      ].join("\n");

      return generateGeminiText(prompt, fallback, {
        temperature: 0.35,
        maxOutputTokens: 180,
        cleanText: cleanGreetingText,
        validateText: isUsableGreeting,
      });
    }),

  generateCareAdvice: publicProcedure
    .input(z.object({ seniorId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const senior = await getAccessibleSenior(input.seniorId, ctx);
      const fallback = buildAdviceFallback(senior);
      const prompt = [
        "你是台灣獨居長者關懷小組的照護協作員。",
        "請依長者資料，產生給志工看的 3 點探視與電話關懷注意事項。",
        `長者姓名：${senior.name}`,
        `健康狀況：${senior.health}`,
        `健康備註：${senior.healthNote || "無"}`,
        `關懷訪談記錄：${senior.careInterviewNote || "無"}`,
        "輸出規則：",
        "1. 只輸出 3 行，每行都以「• 」開頭。",
        "2. 每點至少 18 個中文字，要具體可執行，不要空泛鼓勵。",
        "3. 若有關懷訪談記錄，優先根據訪談內容提出可詢問、可觀察、可追蹤的重點。",
        "4. 使用繁體中文，不要提到 AI、模型、以下是、僅供參考。",
        "5. 不要給醫療診斷；重點放在志工可觀察、可詢問、可聯繫的事項。",
      ].join("\n");

      return generateGeminiText(prompt, fallback, {
        temperature: 0.25,
        maxOutputTokens: 260,
        cleanText: cleanAdviceText,
        validateText: isUsableAdvice,
      });
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
