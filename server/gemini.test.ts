import { describe, it, expect } from "vitest";

const hasGeminiApiKey = Boolean(process.env.VITE_GEMINI_API_KEY);
const describeGemini = hasGeminiApiKey ? describe : describe.skip;

describeGemini("Gemini API Key Validation", () => {
  it("VITE_GEMINI_API_KEY should be set", () => {
    // 在伺服器端測試環境變數是否存在
    const apiKey = process.env.VITE_GEMINI_API_KEY;
    expect(apiKey).toBeTruthy();
    expect(apiKey?.length).toBeGreaterThan(10);
  });

  it("Gemini API should respond with valid content", async () => {
    const apiKey = process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("VITE_GEMINI_API_KEY is not set");
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "請用一句話說「測試成功」" }] }],
        }),
      }
    );

    expect(response.ok).toBe(true);
    const data = await response.json() as {
      candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    expect(text).toBeTruthy();
    console.log("Gemini API response:", text);
  }, 15000);
});
