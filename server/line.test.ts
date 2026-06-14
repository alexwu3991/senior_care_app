import { describe, expect, it } from "vitest";

const hasLineCredentials = Boolean(
  process.env.LINE_CHANNEL_ACCESS_TOKEN &&
    process.env.LINE_CHANNEL_SECRET &&
    process.env.LINE_CHANNEL_ID
);
const describeLine = hasLineCredentials ? describe : describe.skip;

describeLine("LINE Messaging API credentials", () => {
  it("should have LINE_CHANNEL_ACCESS_TOKEN set", () => {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    expect(token).toBeDefined();
    expect(token!.length).toBeGreaterThan(10);
  });

  it("should have LINE_CHANNEL_SECRET set", () => {
    const secret = process.env.LINE_CHANNEL_SECRET;
    expect(secret).toBeDefined();
    expect(secret!.length).toBeGreaterThan(5);
  });

  it("should have LINE_CHANNEL_ID set", () => {
    const channelId = process.env.LINE_CHANNEL_ID;
    expect(channelId).toBeDefined();
    expect(channelId).toBe("2010369139");
  });

  it("should be able to reach LINE API endpoint", async () => {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      throw new Error("LINE_CHANNEL_ACCESS_TOKEN not set");
    }
    // Verify token by calling the LINE bot info endpoint
    const response = await fetch("https://api.line.me/v2/bot/info", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    // Should return 200 with bot info
    expect(response.status).toBe(200);
    const data = await response.json() as { userId: string; displayName: string };
    expect(data.userId).toBeDefined();
    console.log(`LINE Bot connected: ${data.displayName} (${data.userId})`);
  }, 15000);
});
