import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { timingSafeEqual, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import type { ManagerAccount, User } from "../drizzle/schema";
import {
  createManagerAccount,
  getManagerByOpenId,
  getManagerByUsername,
  listManagerAccounts,
  updateManagerLastSignedIn,
} from "./seniorDb";
import { getSessionCookieOptions } from "./_core/cookies";

const scrypt = promisify(scryptCallback);
const LOCAL_OPEN_ID_PREFIX = "local:";

export function isLocalManagerAuthEnabled(): boolean {
  return process.env.MANAGER_AUTH_ENABLED === "true" || process.env.AUTH_MODE === "local";
}

export function isAnyAuthConfigured(): boolean {
  return Boolean(process.env.OAUTH_SERVER_URL && process.env.VITE_APP_ID) || isLocalManagerAuthEnabled();
}

function getSessionSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || "";
  if (!secret) {
    throw new Error("JWT_SECRET is required when manager login is enabled");
  }
  return new TextEncoder().encode(secret);
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function managerToUser(manager: ManagerAccount): User {
  const now = new Date();
  return {
    id: manager.id,
    openId: `${LOCAL_OPEN_ID_PREFIX}${manager.username}`,
    name: manager.name,
    email: manager.email,
    loginMethod: "local",
    role: manager.role,
    createdAt: manager.createdAt ?? now,
    updatedAt: manager.updatedAt ?? now,
    lastSignedIn: manager.lastSignedIn ?? now,
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [scheme, salt, storedHash] = passwordHash.split("$");
  if (scheme !== "scrypt" || !salt || !storedHash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const stored = Buffer.from(storedHash, "base64url");
  if (derived.length !== stored.length) return false;
  return timingSafeEqual(derived, stored);
}

async function signLocalSession(manager: ManagerAccount): Promise<string> {
  const expiresAt = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);
  return new SignJWT({
    openId: `${LOCAL_OPEN_ID_PREFIX}${manager.username}`,
    appId: process.env.VITE_APP_ID || "local-manager-auth",
    name: manager.name,
    authProvider: "local",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expiresAt)
    .sign(getSessionSecret());
}

function getCookieValue(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  return cookieHeader
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function authenticateLocalManager(req: Request): Promise<User | null> {
  if (!isLocalManagerAuthEnabled()) return null;
  const cookie = getCookieValue(req, COOKIE_NAME);
  if (!cookie) return null;

  try {
    const { payload } = await jwtVerify(cookie, getSessionSecret(), {
      algorithms: ["HS256"],
    });
    const openId = String(payload.openId || "");
    if (!openId.startsWith(LOCAL_OPEN_ID_PREFIX)) return null;
    const manager = await getManagerByOpenId(openId);
    if (!manager || manager.active !== 1) return null;
    return managerToUser(manager);
  } catch {
    return null;
  }
}

export async function loginLocalManager(
  username: string,
  password: string,
  res: Response,
  req: Request
): Promise<User> {
  if (!isLocalManagerAuthEnabled()) {
    throw new Error("內建管理者登入尚未啟用");
  }

  await ensureInitialAdminAccount();
  const manager = await getManagerByUsername(normalizeUsername(username));
  if (!manager || manager.active !== 1) {
    throw new Error("帳號或密碼錯誤");
  }
  const valid = await verifyPassword(password, manager.passwordHash);
  if (!valid) {
    throw new Error("帳號或密碼錯誤");
  }

  const sessionToken = await signLocalSession(manager);
  res.cookie(COOKIE_NAME, sessionToken, {
    ...getSessionCookieOptions(req),
    maxAge: ONE_YEAR_MS,
  });
  await updateManagerLastSignedIn(manager.id);
  return managerToUser({
    ...manager,
    lastSignedIn: new Date(),
  });
}

export async function ensureInitialAdminAccount(): Promise<void> {
  if (!isLocalManagerAuthEnabled()) return;
  const managers = await listManagerAccounts();
  if (managers.length > 0) return;

  const username = normalizeUsername(process.env.INITIAL_ADMIN_USERNAME || "");
  const password = process.env.INITIAL_ADMIN_PASSWORD || "";
  const name = process.env.INITIAL_ADMIN_NAME || "系統管理員";

  if (!username || !password) {
    console.warn("[Auth] MANAGER_AUTH_ENABLED=true but INITIAL_ADMIN_USERNAME/PASSWORD are not configured");
    return;
  }

  await createManagerAccount({
    username,
    passwordHash: await hashPassword(password),
    name,
    email: process.env.INITIAL_ADMIN_EMAIL || null,
    role: "admin",
    active: 1,
  });
}
