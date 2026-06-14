import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, bigint } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 長者資料表
 */
export const seniors = mysqlTable("seniors", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  address: text("address").notNull(),
  health: mysqlEnum("health", ["良好", "慢性病", "行動不便", "需定期回診", "其他"])
    .default("良好")
    .notNull(),
  healthNote: text("healthNote"),
  // Line 整合欄位
  lineUserId: varchar("lineUserId", { length: 64 }), // Line 用戶 ID（長者加入好友後取得）
  lineDisplayName: varchar("lineDisplayName", { length: 100 }), // Line 顯示名稱
  // 狀態追蹤
  status: mysqlEnum("status", ["green", "yellow", "red", "gray"])
    .default("gray")
    .notNull(),
  lastReportTime: bigint("lastReportTime", { mode: "number" }), // UTC ms
  messageSentTime: bigint("messageSentTime", { mode: "number" }), // UTC ms
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Senior = typeof seniors.$inferSelect;
export type InsertSenior = typeof seniors.$inferInsert;

/**
 * 訊息記錄表
 */
export const messageLog = mysqlTable("message_log", {
  id: int("id").autoincrement().primaryKey(),
  seniorId: int("seniorId").notNull(),
  direction: mysqlEnum("direction", ["outbound", "inbound"]).notNull(),
  messageText: text("messageText").notNull(),
  lineMessageId: varchar("lineMessageId", { length: 100 }),
  sentAt: bigint("sentAt", { mode: "number" }).notNull(), // UTC ms
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MessageLog = typeof messageLog.$inferSelect;
export type InsertMessageLog = typeof messageLog.$inferInsert;