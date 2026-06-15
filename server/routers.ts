import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import {
  hashPassword,
  isLocalManagerAuthEnabled,
  loginLocalManager,
} from "./localAuth";
import { seniorRouter } from "./routers/senior";
import {
  createManagerAccount,
  getManagerById,
  listManagerAccounts,
  updateManagerPassword,
} from "./seniorDb";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    login: publicProcedure
      .input(
        z.object({
          username: z.string().min(1),
          password: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const user = await loginLocalManager(
          input.username,
          input.password,
          ctx.res,
          ctx.req
        );
        return { user };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    listManagers: adminProcedure.query(async () => {
      const managers = await listManagerAccounts();
      return managers.map(manager => ({
        id: manager.id,
        username: manager.username,
        name: manager.name,
        email: manager.email,
        role: manager.role,
        active: manager.active === 1,
        createdAt: manager.createdAt,
        lastSignedIn: manager.lastSignedIn,
      }));
    }),
    createManager: adminProcedure
      .input(
        z.object({
          username: z.string().min(3).max(64),
          password: z.string().min(8).max(128),
          name: z.string().min(1).max(100),
          email: z.string().email().optional().or(z.literal("")),
          role: z.enum(["user", "admin"]).default("user"),
        })
      )
      .mutation(async ({ input }) => {
        if (!isLocalManagerAuthEnabled()) {
          throw new Error("內建管理者登入尚未啟用");
        }
        const id = await createManagerAccount({
          username: input.username,
          passwordHash: await hashPassword(input.password),
          name: input.name,
          email: input.email || null,
          role: input.role,
          active: 1,
        });
        return { id };
      }),
    resetManagerPassword: adminProcedure
      .input(
        z.object({
          id: z.number(),
          password: z.string().min(8).max(128),
        })
      )
      .mutation(async ({ input }) => {
        const manager = await getManagerById(input.id);
        if (!manager) {
          throw new Error("找不到管理者帳號");
        }
        await updateManagerPassword(input.id, await hashPassword(input.password));
        return { success: true };
      }),
  }),

  senior: seniorRouter,
});

export type AppRouter = typeof appRouter;
