import crypto from 'crypto';
import 'dotenv/config';

const secret = process.env.LINE_CHANNEL_SECRET;

// Line Verify 按鈕發送的是一個空 events 的 body
// 格式如下（Line 官方文件）
const verifyBody = '{"destination":"U98f608b465602c9ae38d061495aa9a00","events":[]}';

if (secret) {
  const hash = crypto.createHmac('sha256', secret).update(verifyBody).digest('base64');
  console.log('Verify body:', verifyBody);
  console.log('Expected signature:', hash);
  
  // 現在模擬發送到我們的 webhook
  const response = await fetch('https://seniorcare-h6fau4ip.manus.space/api/line/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-line-signature': hash,
    },
    body: verifyBody,
  });
  
  console.log('Response status:', response.status);
  const text = await response.text();
  console.log('Response body:', text);
}
