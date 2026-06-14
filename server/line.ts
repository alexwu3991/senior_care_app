import crypto from "crypto";

const LINE_API_BASE = "https://api.line.me/v2/bot";

function getLineChannelAccessToken(): string {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
}

function getLineChannelSecret(): string {
  return process.env.LINE_CHANNEL_SECRET || "";
}

export function createLineSignature(body: string, secret = getLineChannelSecret()): string {
  return crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64");
}

/**
 * 驗證 Line Webhook 簽名
 */
export function verifyLineSignature(
  body: string,
  signature: string,
  secret = getLineChannelSecret()
): boolean {
  if (!secret || !signature) return false;

  const expected = createLineSignature(body, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * 發送文字訊息給指定的 Line 用戶
 */
export async function sendLineMessage(
  lineUserId: string,
  messages: LineMessage[]
): Promise<{ success: boolean; error?: string }> {
  const accessToken = getLineChannelAccessToken();
  if (!accessToken) {
    return {
      success: false,
      error: "LINE_CHANNEL_ACCESS_TOKEN is not configured",
    };
  }

  try {
    const response = await fetch(`${LINE_API_BASE}/message/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json() as { message?: string };
      return { success: false, error: errorData.message || `HTTP ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * 發送帶有快速回覆按鈕的問候訊息
 */
export async function sendGreetingWithReplyButton(
  lineUserId: string,
  seniorName: string,
  greetingText: string,
  reportToken: string,
  appBaseUrl: string
): Promise<{ success: boolean; error?: string }> {
  const reportUrl = `${appBaseUrl}/report/${reportToken}`;

  const messages: LineMessage[] = [
    {
      type: "text",
      text: greetingText,
      quickReply: {
        items: [
          {
            type: "action",
            action: {
              type: "uri",
              label: "✅ 我很平安，請放心",
              uri: reportUrl,
            },
          },
          {
            type: "action",
            action: {
              type: "message",
              label: "🆘 需要幫助",
              text: "我需要幫助",
            },
          },
        ],
      },
    },
  ];

  return sendLineMessage(lineUserId, messages);
}

/**
 * 取得 Line 用戶個人資料
 */
export async function getLineUserProfile(lineUserId: string): Promise<{
  userId: string;
  displayName: string;
  pictureUrl?: string;
} | null> {
  const accessToken = getLineChannelAccessToken();
  if (!accessToken) return null;

  try {
    const response = await fetch(`${LINE_API_BASE}/profile/${lineUserId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) return null;

    return await response.json() as {
      userId: string;
      displayName: string;
      pictureUrl?: string;
    };
  } catch {
    return null;
  }
}

// --- Types ---

export type LineMessage =
  | LineTextMessage
  | LineFlexMessage;

export interface LineTextMessage {
  type: "text";
  text: string;
  quickReply?: {
    items: QuickReplyItem[];
  };
}

export interface LineFlexMessage {
  type: "flex";
  altText: string;
  contents: object;
}

export interface QuickReplyItem {
  type: "action";
  action: {
    type: "uri" | "message" | "postback";
    label: string;
    uri?: string;
    text?: string;
    data?: string;
  };
}

export interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source: {
    type: string;
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  timestamp: number;
  message?: {
    id: string;
    type: string;
    text?: string;
  };
  follow?: object;
  postback?: {
    data: string;
  };
}

export interface LineWebhookBody {
  destination: string;
  events: LineWebhookEvent[];
}
