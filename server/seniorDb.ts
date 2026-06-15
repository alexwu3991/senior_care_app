import { eq, desc } from "drizzle-orm";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getDb } from "./db";
import {
  seniors,
  messageLog,
  managerAccounts,
  InsertSenior,
  InsertMessageLog,
  InsertManagerAccount,
  ManagerAccount,
  Senior,
} from "../drizzle/schema";

type LocalMessage = InsertMessageLog & { id: number; createdAt: Date };
type PersistedSenior = Omit<Senior, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};
type PersistedMessage = Omit<LocalMessage, "createdAt"> & {
  createdAt: string;
};
type PersistedManagerAccount = Omit<ManagerAccount, "createdAt" | "updatedAt" | "lastSignedIn"> & {
  createdAt: string;
  updatedAt: string;
  lastSignedIn: string | null;
};
type LocalStoreFile = {
  nextSeniorId: number;
  nextMessageId: number;
  nextManagerId?: number;
  seniors: PersistedSenior[];
  messages: PersistedMessage[];
  managers?: PersistedManagerAccount[];
  dailyGreetingSettings?: PersistedDailyGreetingSettings;
};
export type DailyGreetingSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
  timeZone: string;
  updatedAt: number;
};
type PersistedDailyGreetingSettings = Omit<DailyGreetingSettings, "updatedAt"> & {
  updatedAt: string;
};

const REPORT_TOKEN_PREFIX = "report:";
const localStorePath = process.env.LOCAL_DATA_PATH || join(process.cwd(), ".local-data", "senior-store.json");
const memorySeniors: Senior[] = [];
const memoryMessages: LocalMessage[] = [];
const memoryManagers: ManagerAccount[] = [];
let memoryDailyGreetingSettings: DailyGreetingSettings = getDefaultDailyGreetingSettings();
let nextMemorySeniorId = 1;
let nextMemoryMessageId = 1;
let nextMemoryManagerId = 1;
let warnedMemoryStore = false;
let localStoreLoaded = false;
let localStoreWriteQueue = Promise.resolve();

function getEnvNumber(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function getDefaultDailyGreetingSettings(): DailyGreetingSettings {
  return {
    enabled: process.env.DAILY_GREETING_ENABLED !== "false",
    hour: getEnvNumber("DAILY_GREETING_HOUR", 8, 0, 23),
    minute: getEnvNumber("DAILY_GREETING_MINUTE", 0, 0, 59),
    timeZone: process.env.DAILY_GREETING_TIME_ZONE || "Asia/Taipei",
    updatedAt: Date.now(),
  };
}

function warnMemoryStore(): void {
  if (warnedMemoryStore) return;
  warnedMemoryStore = true;
  console.warn(`[Database] DATABASE_URL not set; using local file store at ${localStorePath}`);
}

function serializeSenior(senior: Senior): PersistedSenior {
  return {
    ...senior,
    createdAt: senior.createdAt.toISOString(),
    updatedAt: senior.updatedAt.toISOString(),
  };
}

function serializeMessage(message: LocalMessage): PersistedMessage {
  return {
    ...message,
    createdAt: message.createdAt.toISOString(),
  };
}

function serializeManager(manager: ManagerAccount): PersistedManagerAccount {
  return {
    ...manager,
    createdAt: manager.createdAt.toISOString(),
    updatedAt: manager.updatedAt.toISOString(),
    lastSignedIn: manager.lastSignedIn ? manager.lastSignedIn.toISOString() : null,
  };
}

function serializeDailyGreetingSettings(
  settings: DailyGreetingSettings
): PersistedDailyGreetingSettings {
  return {
    ...settings,
    updatedAt: new Date(settings.updatedAt).toISOString(),
  };
}

async function loadLocalStore(): Promise<void> {
  if (localStoreLoaded) return;
  localStoreLoaded = true;

  try {
    const raw = await readFile(localStorePath, "utf8");
    const parsed = JSON.parse(raw) as LocalStoreFile;

    memorySeniors.splice(
      0,
      memorySeniors.length,
      ...parsed.seniors.map(senior => ({
        ...senior,
        careInterviewNote: senior.careInterviewNote ?? null,
        managerOpenId: senior.managerOpenId ?? null,
        managerName: senior.managerName ?? null,
        createdAt: new Date(senior.createdAt),
        updatedAt: new Date(senior.updatedAt),
      }))
    );
    memoryMessages.splice(
      0,
      memoryMessages.length,
      ...parsed.messages.map(message => ({
        ...message,
        createdAt: new Date(message.createdAt),
      }))
    );
    memoryManagers.splice(
      0,
      memoryManagers.length,
      ...(parsed.managers ?? []).map(manager => ({
        ...manager,
        createdAt: new Date(manager.createdAt),
        updatedAt: new Date(manager.updatedAt),
        lastSignedIn: manager.lastSignedIn ? new Date(manager.lastSignedIn) : null,
      }))
    );
    nextMemorySeniorId =
      parsed.nextSeniorId ||
      Math.max(0, ...memorySeniors.map(senior => senior.id)) + 1;
    nextMemoryMessageId =
      parsed.nextMessageId ||
      Math.max(0, ...memoryMessages.map(message => message.id)) + 1;
    nextMemoryManagerId =
      parsed.nextManagerId ||
      Math.max(0, ...memoryManagers.map(manager => manager.id)) + 1;

    if (parsed.dailyGreetingSettings) {
      memoryDailyGreetingSettings = {
        ...parsed.dailyGreetingSettings,
        updatedAt: new Date(parsed.dailyGreetingSettings.updatedAt).getTime(),
      };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[Database] Failed to load local file store:", error);
    }
  }
}

async function saveLocalStore(): Promise<void> {
  const payload: LocalStoreFile = {
    nextSeniorId: nextMemorySeniorId,
    nextMessageId: nextMemoryMessageId,
    nextManagerId: nextMemoryManagerId,
    seniors: memorySeniors.map(serializeSenior),
    messages: memoryMessages.map(serializeMessage),
    managers: memoryManagers.map(serializeManager),
    dailyGreetingSettings: serializeDailyGreetingSettings(memoryDailyGreetingSettings),
  };

  localStoreWriteQueue = localStoreWriteQueue.then(async () => {
    await mkdir(dirname(localStorePath), { recursive: true });
    await writeFile(localStorePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  });

  await localStoreWriteQueue;
}

async function ensureLocalStore(): Promise<void> {
  warnMemoryStore();
  await loadLocalStore();
}

function createMemorySenior(data: InsertSenior): Senior {
  const now = new Date();
  const senior = {
    id: nextMemorySeniorId++,
    name: data.name,
    phone: data.phone,
    address: data.address,
    health: data.health ?? "良好",
    healthNote: data.healthNote ?? null,
    careInterviewNote: data.careInterviewNote ?? null,
    managerOpenId: data.managerOpenId ?? null,
    managerName: data.managerName ?? null,
    lineUserId: data.lineUserId ?? null,
    lineDisplayName: data.lineDisplayName ?? null,
    status: data.status ?? "gray",
    lastReportTime: data.lastReportTime ?? null,
    messageSentTime: data.messageSentTime ?? null,
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
  } satisfies Senior;

  memorySeniors.push(senior);
  return senior;
}

function createMemoryManager(data: InsertManagerAccount): ManagerAccount {
  const now = new Date();
  const manager = {
    id: nextMemoryManagerId++,
    username: data.username,
    passwordHash: data.passwordHash,
    name: data.name,
    email: data.email ?? null,
    role: data.role ?? "user",
    active: data.active ?? 1,
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
    lastSignedIn: data.lastSignedIn ?? null,
  } satisfies ManagerAccount;

  memoryManagers.push(manager);
  return manager;
}

// --- Senior CRUD ---

export async function getAllSeniors(): Promise<Senior[]> {
  const db = await getDb();
  if (!db) {
    await ensureLocalStore();
    return [...memorySeniors].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(seniors).orderBy(desc(seniors.createdAt));
}

// --- App Settings ---

export async function getDailyGreetingSettings(): Promise<DailyGreetingSettings> {
  const db = await getDb();
  if (!db) {
    await ensureLocalStore();
  }
  return { ...memoryDailyGreetingSettings };
}

export async function updateDailyGreetingSettings(
  data: Partial<Pick<DailyGreetingSettings, "enabled" | "hour" | "minute" | "timeZone">>
): Promise<DailyGreetingSettings> {
  const db = await getDb();
  if (!db) {
    await ensureLocalStore();
  }

  memoryDailyGreetingSettings = {
    ...memoryDailyGreetingSettings,
    ...data,
    updatedAt: Date.now(),
  };

  if (!db) {
    await saveLocalStore();
  }

  return { ...memoryDailyGreetingSettings };
}

export async function getSeniorById(id: number): Promise<Senior | undefined> {
  const db = await getDb();
  if (!db) {
    await ensureLocalStore();
    return memorySeniors.find(senior => senior.id === id);
  }
  const result = await db.select().from(seniors).where(eq(seniors.id, id)).limit(1);
  return result[0];
}

export async function getSeniorByLineUserId(lineUserId: string): Promise<Senior | undefined> {
  const db = await getDb();
  if (!db) {
    await ensureLocalStore();
    return memorySeniors.find(senior => senior.lineUserId === lineUserId);
  }
  const result = await db
    .select()
    .from(seniors)
    .where(eq(seniors.lineUserId, lineUserId))
    .limit(1);
  return result[0];
}

export async function createSenior(data: InsertSenior): Promise<number> {
  const db = await getDb();
  if (!db) {
    await ensureLocalStore();
    const senior = createMemorySenior(data);
    await saveLocalStore();
    return senior.id;
  }
  const result = await db.insert(seniors).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function updateSenior(
  id: number,
  data: Partial<InsertSenior>
): Promise<void> {
  const db = await getDb();
  if (!db) {
    await ensureLocalStore();
    const index = memorySeniors.findIndex(senior => senior.id === id);
    if (index === -1) return;
    memorySeniors[index] = {
      ...memorySeniors[index],
      ...data,
      healthNote: data.healthNote === undefined ? memorySeniors[index].healthNote : data.healthNote,
      careInterviewNote: data.careInterviewNote === undefined ? memorySeniors[index].careInterviewNote : data.careInterviewNote,
      managerOpenId: data.managerOpenId === undefined ? memorySeniors[index].managerOpenId : data.managerOpenId,
      managerName: data.managerName === undefined ? memorySeniors[index].managerName : data.managerName,
      lineUserId: data.lineUserId === undefined ? memorySeniors[index].lineUserId : data.lineUserId,
      lineDisplayName: data.lineDisplayName === undefined ? memorySeniors[index].lineDisplayName : data.lineDisplayName,
      lastReportTime: data.lastReportTime === undefined ? memorySeniors[index].lastReportTime : data.lastReportTime,
      messageSentTime: data.messageSentTime === undefined ? memorySeniors[index].messageSentTime : data.messageSentTime,
      updatedAt: new Date(),
    };
    await saveLocalStore();
    return;
  }
  await db.update(seniors).set(data).where(eq(seniors.id, id));
}

export async function deleteSenior(id: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    await ensureLocalStore();
    const index = memorySeniors.findIndex(senior => senior.id === id);
    if (index !== -1) memorySeniors.splice(index, 1);
    await saveLocalStore();
    return;
  }
  await db.delete(seniors).where(eq(seniors.id, id));
}

// --- Manager Accounts ---

export async function listManagerAccounts(): Promise<ManagerAccount[]> {
  const db = await getDb();
  if (!db) {
    await ensureLocalStore();
    return [...memoryManagers].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(managerAccounts).orderBy(desc(managerAccounts.createdAt));
}

export async function getManagerByUsername(username: string): Promise<ManagerAccount | undefined> {
  const normalized = username.trim().toLowerCase();
  const db = await getDb();
  if (!db) {
    await ensureLocalStore();
    return memoryManagers.find(manager => manager.username === normalized);
  }
  const result = await db
    .select()
    .from(managerAccounts)
    .where(eq(managerAccounts.username, normalized))
    .limit(1);
  return result[0];
}

export async function getManagerByOpenId(openId: string): Promise<ManagerAccount | undefined> {
  if (!openId.startsWith("local:")) return undefined;
  return getManagerByUsername(openId.slice("local:".length));
}

export async function createManagerAccount(data: InsertManagerAccount): Promise<number> {
  const normalizedData: InsertManagerAccount = {
    ...data,
    username: data.username.trim().toLowerCase(),
  };
  const db = await getDb();
  if (!db) {
    await ensureLocalStore();
    if (memoryManagers.some(manager => manager.username === normalizedData.username)) {
      throw new Error("管理者帳號已存在");
    }
    const manager = createMemoryManager(normalizedData);
    await saveLocalStore();
    return manager.id;
  }
  const result = await db.insert(managerAccounts).values(normalizedData);
  return (result[0] as { insertId: number }).insertId;
}

export async function updateManagerLastSignedIn(id: number): Promise<void> {
  const db = await getDb();
  const now = new Date();
  if (!db) {
    await ensureLocalStore();
    const index = memoryManagers.findIndex(manager => manager.id === id);
    if (index === -1) return;
    memoryManagers[index] = {
      ...memoryManagers[index],
      lastSignedIn: now,
      updatedAt: now,
    };
    await saveLocalStore();
    return;
  }
  await db.update(managerAccounts).set({ lastSignedIn: now }).where(eq(managerAccounts.id, id));
}

// --- Message Log ---

export async function logMessage(data: InsertMessageLog): Promise<void> {
  const db = await getDb();
  if (!db) {
    await ensureLocalStore();
    memoryMessages.push({
      id: nextMemoryMessageId++,
      createdAt: new Date(),
      ...data,
    });
    await saveLocalStore();
    return;
  }
  await db.insert(messageLog).values(data);
}

export function reportTokenToMessageId(reportToken: string): string {
  return `${REPORT_TOKEN_PREFIX}${reportToken}`;
}

export async function getSeniorByReportToken(reportToken: string): Promise<Senior | undefined> {
  const reportMessageId = reportTokenToMessageId(reportToken);
  const db = await getDb();

  if (!db) {
    await ensureLocalStore();
    const message = memoryMessages.find(item => item.lineMessageId === reportMessageId);
    if (!message) return undefined;
    return memorySeniors.find(senior => senior.id === message.seniorId);
  }

  const result = await db
    .select()
    .from(messageLog)
    .where(eq(messageLog.lineMessageId, reportMessageId))
    .limit(1);
  const message = result[0];
  if (!message) return undefined;
  return getSeniorById(message.seniorId);
}

export async function recordSafeReportByToken(reportToken: string): Promise<{
  success: boolean;
  senior?: Senior;
  error?: string;
}> {
  const senior = await getSeniorByReportToken(reportToken);
  if (!senior) {
    return {
      success: false,
      error: "REPORT_TOKEN_NOT_FOUND",
    };
  }

  const now = Date.now();
  await updateSenior(senior.id, {
    status: "green",
    lastReportTime: now,
  });

  await logMessage({
    seniorId: senior.id,
    direction: "inbound",
    messageText: "長者透過 Line 回報連結回報平安",
    lineMessageId: `${reportTokenToMessageId(reportToken)}:safe`,
    sentAt: now,
  });

  const updatedSenior = await getSeniorById(senior.id);
  return {
    success: true,
    senior: updatedSenior || senior,
  };
}

export async function getMessagesBySeniorId(seniorId: number) {
  const db = await getDb();
  if (!db) {
    await ensureLocalStore();
    return memoryMessages
      .filter(message => message.seniorId === seniorId)
      .sort((a, b) => b.sentAt - a.sentAt)
      .slice(0, 20);
  }
  return db
    .select()
    .from(messageLog)
    .where(eq(messageLog.seniorId, seniorId))
    .orderBy(desc(messageLog.sentAt))
    .limit(20);
}

// --- Pending Line Users（尚未綁定的好友）---
// 使用 in-memory 暫存，記錄加入好友但尚未綁定的 Line User
const pendingLineUsers: Array<{ lineUserId: string; displayName: string; addedAt: number }> = [];

export function addPendingLineUser(lineUserId: string, displayName: string): void {
  // 避免重複
  const exists = pendingLineUsers.find(u => u.lineUserId === lineUserId);
  if (!exists) {
    pendingLineUsers.push({ lineUserId, displayName, addedAt: Date.now() });
    // 只保留最近 50 筆
    if (pendingLineUsers.length > 50) pendingLineUsers.shift();
  }
}

export function getPendingLineUsers(): Array<{ lineUserId: string; displayName: string; addedAt: number }> {
  return [...pendingLineUsers];
}

export function removePendingLineUser(lineUserId: string): void {
  const idx = pendingLineUsers.findIndex(u => u.lineUserId === lineUserId);
  if (idx !== -1) pendingLineUsers.splice(idx, 1);
}
