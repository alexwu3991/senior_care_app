import { describe, expect, it } from "vitest";
import {
  createSenior,
  deleteSenior,
  getMessagesBySeniorId,
  getSeniorById,
  logMessage,
  recordSafeReportByToken,
  reportTokenToMessageId,
} from "./seniorDb";

describe("safe report token", () => {
  it("marks the matching senior safe and records an inbound report", async () => {
    const seniorId = await createSenior({
      name: "Report Token Test",
      phone: "0900-000-000",
      address: "Test Address",
      health: "良好",
      healthNote: null,
      lineUserId: "U22222222222222222222222222222222",
      lineDisplayName: "Report Token Test Line",
      status: "gray",
      lastReportTime: null,
      messageSentTime: Date.now(),
    });
    try {
      const reportToken = `unit-${seniorId}`;

      await logMessage({
        seniorId,
        direction: "outbound",
        messageText: "測試問候訊息",
        lineMessageId: reportTokenToMessageId(reportToken),
        sentAt: Date.now(),
      });

      const result = await recordSafeReportByToken(reportToken);
      const senior = await getSeniorById(seniorId);
      const messages = await getMessagesBySeniorId(seniorId);

      expect(result.success).toBe(true);
      expect(result.senior?.id).toBe(seniorId);
      expect(senior?.status).toBe("green");
      expect(senior?.lastReportTime).toEqual(expect.any(Number));
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            direction: "inbound",
            messageText: "長者透過 Line 回報連結回報平安",
          }),
        ])
      );
    } finally {
      await deleteSenior(seniorId);
    }
  });

  it("rejects an unknown report token", async () => {
    const result = await recordSafeReportByToken("missing-token");

    expect(result).toEqual({
      success: false,
      error: "REPORT_TOKEN_NOT_FOUND",
    });
  });
});
