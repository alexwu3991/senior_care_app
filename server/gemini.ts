type GeminiPart = {
  text?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  error?: {
    message?: string;
  };
};

export type GeminiSource = "gemini" | "fallback";

export function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

export async function generateGeminiText(
  prompt: string,
  fallbackText: string
): Promise<{
  text: string;
  source: GeminiSource;
  model: string | null;
  error?: string;
}> {
  const apiKey = getGeminiApiKey();
  const primaryModel = getGeminiModel();
  const models = Array.from(
    new Set([
      primaryModel,
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
    ])
  );

  if (!apiKey) {
    return {
      text: fallbackText,
      source: "fallback",
      model: null,
      error: "GEMINI_API_KEY is not configured",
    };
  }

  const errors: string[] = [];

  for (const model of models) {
    try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 220,
          },
        }),
      }
    );

    const data = (await response.json().catch(() => ({}))) as GeminiResponse;

    if (!response.ok) {
      throw new Error(data.error?.message || `Gemini API Error: ${response.status}`);
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!text) {
      throw new Error("Gemini API returned no text");
    }

    return {
      text,
      source: "gemini",
      model,
    };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${model}: ${message}`);
      console.warn(`[Gemini] Model ${model} failed:`, message);
    }
  }

  const error = errors.join(" | ");
  console.warn("[Gemini] Falling back to local template:", error);
  return {
    text: fallbackText,
    source: "fallback",
    model: primaryModel,
    error,
  }
}
