import 'dotenv/config';

const apiKey = process.env.VITE_GEMINI_API_KEY;

// 列出所有可用模型
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  { headers: { 'Content-Type': 'application/json' } }
);

console.log('Status:', response.status);
const data = await response.json();

if (data.models) {
  console.log('Available models:');
  data.models.forEach(m => {
    if (m.supportedGenerationMethods?.includes('generateContent')) {
      console.log(' -', m.name);
    }
  });
} else {
  console.log('Response:', JSON.stringify(data, null, 2));
}
