import crypto from 'crypto';
import 'dotenv/config';

const secret = process.env.LINE_CHANNEL_SECRET;
const verifyBody = '{"destination":"U98f608b465602c9ae38d061495aa9a00","events":[]}';

const hash = crypto.createHmac('sha256', secret).update(verifyBody).digest('base64');
console.log('Computed signature:', hash);

// 測試本地伺服器
try {
  const response = await fetch('http://localhost:3000/api/line/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-line-signature': hash,
    },
    body: verifyBody,
  });

  console.log('Local Response status:', response.status);
  const text = await response.text();
  console.log('Local Response body:', text);
} catch (e) {
  console.error('Connection error:', e.message);
}
