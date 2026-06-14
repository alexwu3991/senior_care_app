import 'dotenv/config';

const apiKey = process.env.VITE_GEMINI_API_KEY;
console.log('API Key set:', !!apiKey);
console.log('API Key prefix:', apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET');

// 測試 Gemini API
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: '請用一句話說測試成功' }] }],
    }),
  }
);

console.log('Response status:', response.status);
const data = await response.json();
console.log('Response body:', JSON.stringify(data, null, 2));
