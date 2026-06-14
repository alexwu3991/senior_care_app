import { nanoid } from "nanoid";
import {
  getAllSeniors,
  getDailyGreetingSettings,
  logMessage,
  reportTokenToMessageId,
  updateSenior,
} from "./seniorDb";
import { sendGreetingWithReplyButton } from "./line";

const DEFAULT_DAILY_GREETING_HOUR = 8;
const DEFAULT_DAILY_GREETING_MINUTE = 0;
const DEFAULT_TIME_ZONE = "Asia/Taipei";
const DEFAULT_MAX_SEND_ATTEMPTS = 3;

function getLocalDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  const day = parts.find(part => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function getLocalHour(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  }).format(date);

  return Number(hour);
}

function getLocalMinute(date: Date, timeZone: string): number {
  const minute = new Intl.DateTimeFormat("en-US", {
    timeZone,
    minute: "2-digit",
  }).format(date);

  return Number(minute);
}

function hasSentToday(sentAt: number | null, now: Date, timeZone: string): boolean {
  if (!sentAt) return false;
  return getLocalDateKey(new Date(sentAt), timeZone) === getLocalDateKey(now, timeZone);
}

function buildDailyGreeting(name: string): string {
  return `早安，${name}！今天也請記得照顧身體、按時吃飯喝水。\n請點擊下方按鈕回報平安，讓志工知道您一切都好。`;
}

export async function getDailyGreetingPreview(options: {
  now?: Date;
  timeZone?: string;
}): Promise<{
  wouldSend: Array<{ seniorId: number; name: string; lineDisplayName: string | null }>;
  skipped: Array<{ seniorId: number; name: string; reason: string }>;
}> {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const seniors = await getAllSeniors();
  const wouldSend: Array<{ seniorId: number; name: string; lineDisplayName: string | null }> = [];
  const skipped: Array<{ seniorId: number; name: string; reason: string }> = [];

  for (const senior of seniors) {
    if (!senior.lineUserId) {
      skipped.push({ seniorId: senior.id, name: senior.name, reason: "尚未綁定 Line" });
      continue;
    }

    if (hasSentToday(senior.messageSentTime, now, timeZone)) {
      skipped.push({ seniorId: senior.id, name: senior.name, reason: "今天已發送" });
      continue;
    }

    wouldSend.push({
      seniorId: senior.id,
      name: senior.name,
      lineDisplayName: senior.lineDisplayName,
    });
  }

  return { wouldSend, skipped };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendGreetingWithRetries(input: {
  lineUserId: string;
  seniorName: string;
  messageText: string;
  reportToken: string;
  appBaseUrl: string;
  maxAttempts: number;
}): Promise<{ success: boolean; error?: string; attempts: number }> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
    const result = await sendGreetingWithReplyButton(
      input.lineUserId,
      input.seniorName,
      input.messageText,
      input.reportToken,
      input.appBaseUrl
    );

    if (result.success) return { success: true, attempts: attempt };

    lastError = result.error || "Unknown Line API error";
    if (attempt < input.maxAttempts) {
      await delay(500 * attempt);
    }
  }

  return {
    success: false,
    error: lastError || "Unknown Line API error",
    attempts: input.maxAttempts,
  };
}

export async function runDailyGreetingBatch(options: {
  appBaseUrl: string;
  now?: Date;
  timeZone?: string;
  maxAttempts?: number;
}): Promise<{
  attempted: number;
  sent: number;
  skipped: number;
  failed: Array<{ seniorId: number; name: string; error: string; attempts: number }>;
}> {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_SEND_ATTEMPTS;
  const seniors = await getAllSeniors();
  const failed: Array<{ seniorId: number; name: string; error: string; attempts: number }> = [];
  let attempted = 0;
  let sent = 0;
  let skipped = 0;

  for (const senior of seniors) {
    if (!senior.lineUserId || hasSentToday(senior.messageSentTime, now, timeZone)) {
      skipped += 1;
      continue;
    }

    attempted += 1;
    const messageText = buildDailyGreeting(senior.name);
    const reportToken = nanoid(16);
    const result = await sendGreetingWithRetries({
      lineUserId: senior.lineUserId,
      seniorName: senior.name,
      messageText,
      reportToken,
      appBaseUrl: options.appBaseUrl,
      maxAttempts,
    });

    if (!result.success) {
      failed.push({
        seniorId: senior.id,
        name: senior.name,
        error: result.error || "Unknown Line API error",
        attempts: result.attempts,
      });
      continue;
    }

    await updateSenior(senior.id, {
      messageSentTime: now.getTime(),
      status: "gray",
    });

    await logMessage({
      seniorId: senior.id,
      direction: "outbound",
      messageText,
      lineMessageId: reportTokenToMessageId(reportToken),
      sentAt: now.getTime(),
    });

    sent += 1;
  }

  return { attempted, sent, skipped, failed };
}

export function startDailyGreetingScheduler(options: {
  appBaseUrl: string;
  hour?: number;
  minute?: number;
  timeZone?: string;
  intervalMs?: number;
}): NodeJS.Timeout {
  const intervalMs = options.intervalMs ?? 60 * 1000;
  let lastRunScheduleKey: string | null = null;

  async function tick() {
    const now = new Date();
    const settings = await getDailyGreetingSettings();
    const enabled = settings.enabled;
    const hour = settings.hour ?? options.hour ?? DEFAULT_DAILY_GREETING_HOUR;
    const minute = settings.minute ?? options.minute ?? DEFAULT_DAILY_GREETING_MINUTE;
    const timeZone = settings.timeZone ?? options.timeZone ?? DEFAULT_TIME_ZONE;
    const todayKey = getLocalDateKey(now, timeZone);
    const scheduleKey = `${todayKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

    if (
      !enabled ||
      getLocalHour(now, timeZone) !== hour ||
      getLocalMinute(now, timeZone) !== minute ||
      lastRunScheduleKey === scheduleKey
    ) {
      return;
    }

    lastRunScheduleKey = scheduleKey;
    try {
      const result = await runDailyGreetingBatch({
        appBaseUrl: options.appBaseUrl,
        now,
        timeZone,
      });
      console.log("[DailyGreeting] Completed", result);
    } catch (error) {
      console.error("[DailyGreeting] Failed", error);
    }
  }

  void tick();
  return setInterval(tick, intervalMs);
}
