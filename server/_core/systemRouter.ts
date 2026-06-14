import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { buildLineWebhookEndpoint } from "../lineWebhook";
import { getGeminiModel, isGeminiConfigured } from "../gemini";
import {
  getDailyGreetingSettings,
  updateDailyGreetingSettings,
} from "../seniorDb";

const localDataPath = () =>
  process.env.LOCAL_DATA_PATH || ".local-data/senior-store.json";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  status: publicProcedure.query(async () => {
    const hasDatabase = Boolean(process.env.DATABASE_URL);
    const geminiConfigured = isGeminiConfigured();
    const dailyGreetingSettings = await getDailyGreetingSettings();

    return {
      storage: {
        mode: hasDatabase ? "database" : "local-file",
        label: hasDatabase ? "MySQL/TiDB" : "本機 JSON",
        path: hasDatabase ? null : localDataPath(),
      },
      gemini: {
        configured: geminiConfigured,
        label: geminiConfigured ? `真實 Gemini API (${getGeminiModel()})` : "本機範本",
      },
      line: {
        pushConfigured: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
        webhookConfigured: Boolean(process.env.LINE_CHANNEL_SECRET),
        channelIdConfigured: Boolean(process.env.LINE_CHANNEL_ID),
        webhookEndpoint: buildLineWebhookEndpoint(
          process.env.APP_BASE_URL || "http://localhost:3000"
        ),
      },
      dailyGreeting: {
        enabled: dailyGreetingSettings.enabled,
        hour: dailyGreetingSettings.hour,
        minute: dailyGreetingSettings.minute,
        timeZone: dailyGreetingSettings.timeZone,
        updatedAt: dailyGreetingSettings.updatedAt,
      },
      auth: {
        configured: Boolean(process.env.OAUTH_SERVER_URL && process.env.VITE_APP_ID),
      },
      localTestTools: {
        enabled:
          process.env.NODE_ENV !== "production" ||
          process.env.ENABLE_LOCAL_TEST_TOOLS === "true" ||
          !hasDatabase,
      },
    } as const;
  }),

  updateDailyGreeting: publicProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59),
        timeZone: z.string().min(1).max(80),
      })
    )
    .mutation(async ({ input }) => {
      const settings = await updateDailyGreetingSettings(input);
      return {
        success: true,
        settings,
      } as const;
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
