import 'dotenv/config';

const apiKey = process.env.VITE_GEMINI_API_KEY;

// 測試 gemini-2.0-flash-001（最新穩定版）
const models = ['gemini-2.0-flash-001', 'gemini-2.0-flash-lite', 'gemini-2.5-flash'];

for (const model of models) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: '說測試成功' }] }] }),
    }
  );
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log(`${model}: status=${response.status}, text=${text?.substring(0, 30) || JSON.stringify(data.error)}`);
}
