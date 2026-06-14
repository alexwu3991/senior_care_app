import crypto from 'crypto';
import 'dotenv/config';

const secret = process.env.LINE_CHANNEL_SECRET;
console.log('LINE_CHANNEL_SECRET set:', !!secret);
console.log('Secret length:', secret ? secret.length : 0);
console.log('Secret value:', secret ? secret.substring(0, 8) + '...' : 'NOT SET');

// 模擬 Line Verify 時發送的空 body
const testBody = '{"events":[],"destination":"Udeadbeef"}';
if (secret) {
  const hash = crypto.createHmac('sha256', secret).update(testBody).digest('base64');
  console.log('Computed signature for test body:', hash);
}
