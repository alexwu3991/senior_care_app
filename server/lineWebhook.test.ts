import { describe, expect, it } from "vitest";
import {
  createLineSignature,
  verifyLineSignature,
} from "./line";
import {
  buildLineWebhookPayloadForFollow,
  processLineWebhookBody,
} from "./lineWebhook";
import { getPendingLineUsers } from "./seniorDb";

describe("LINE webhook verification", () => {
  it("accepts a valid HMAC-SHA256 signature and rejects invalid signatures", () => {
    const secret = "unit-test-line-secret";
    const body = JSON.stringify({
      destination: "unit-test",
      events: [],
    });
    const signature = createLineSignature(body, secret);

    expect(verifyLineSignature(body, signature, secret)).toBe(true);
    expect(verifyLineSignature(body, "invalid-signature", secret)).toBe(false);
    expect(verifyLineSignature(body, signature, "")).toBe(false);
  });

  it("adds a follow event user to the pending Line binding list", async () => {
    const lineUserId = "U11111111111111111111111111111111";
    const displayName = "Webhook 單元測試用戶";
    const payload = buildLineWebhookPayloadForFollow(lineUserId);

    const result = await processLineWebhookBody(payload, {
      sendReplies: false,
      resolveProfile: async () => ({
        userId: lineUserId,
        displayName,
      }),
    });

    const pendingUsers = getPendingLineUsers();

    expect(result).toMatchObject({
      processed: 1,
      followEvents: 1,
      pendingUsersAdded: 1,
    });
    expect(pendingUsers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lineUserId,
          displayName,
        }),
      ])
    );
  });
});
