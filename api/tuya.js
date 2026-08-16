// Vercel Serverless Function for Tuya Cloud API
// This runs on Vercel server, not in browser (keeps API keys safe)

import crypto from 'crypto';

// Read API credentials from environment variables (Vercel Settings)
const TUYA_ACCESS_ID = process.env.TUYA_ACCESS_ID;
const TUYA_ACCESS_SECRET = process.env.TUYA_ACCESS_SECRET;
const TUYA_ENDPOINT = 'https://openapi.tuyaeu.com'; // Central Europe (Germany)

// Cache access token to avoid re-fetching
let cachedToken = null;
let tokenExpiry = 0;

/**
 * Generate HMAC-SHA256 signature required by Tuya API
 */
function calcSign(str, secret) {
  return crypto.createHmac('sha256', secret).update(str, 'utf8').digest('hex').toUpperCase();
}

/**
 * Build Tuya API request headers with signature
 */
function buildHeaders(method, path, body = '', token = '') {
  const t = Date.now().toString();
  const nonce = '';
  const contentHash = crypto.createHash('sha256').update(body).digest('hex');

  const stringToSign = [method, contentHash, '', path].join('\n');
  const signStr = TUYA_ACCESS_ID + token + t + nonce + stringToSign;
  const sign = calcSign(signStr, TUYA_ACCESS_SECRET);

  const headers = {
    'client_id': TUYA_ACCESS_ID,
    'sign': sign,
    'sign_method': 'HMAC-SHA256',
    't': t,
    'nonce': nonce,
    'Content-Type': 'application/json',
  };
  if (token) headers['access_token'] = token;
  return headers;
}

/**
 * Get access token (cached for 1 hour)
 */
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const path = '/v1.0/token?grant_type=1';
  const headers = buildHeaders('GET', path);

  const res = await fetch(TUYA_ENDPOINT + path, { method: 'GET', headers });
  const data = await res.json();

  if (!data.success) throw new Error('Token error: ' + JSON.stringify(data));

  cachedToken = data.result.access_token;
  tokenExpiry = Date.now() + (data.result.expire_time - 60) * 1000;
  return cachedToken;
}

/**
 * Send command to a device (turn ON or OFF)
 */
async function sendCommand(deviceId, on) {
  const token = await getAccessToken();
  const path = `/v1.0/devices/${deviceId}/commands`;
  const body = JSON.stringify({
    commands: [{ code: 'switch_1', value: on }],
  });

  const headers = buildHeaders('POST', path, body, token);
  const res = await fetch(TUYA_ENDPOINT + path, { method: 'POST', headers, body });
  return await res.json();
}

/**
 * Main API handler
 * Expected: POST { deviceId: "xxx", action: "on" | "off" }
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Only POST allowed' }); return; }

  try {
    const { deviceId, action } = req.body;

    if (!deviceId || !action) {
      res.status(400).json({ error: 'deviceId va action kerak' });
      return;
    }
    if (!TUYA_ACCESS_ID || !TUYA_ACCESS_SECRET) {
      res.status(500).json({ error: 'Tuya kalitlar sozlanmagan (Vercel Environment Variables)' });
      return;
    }

    const on = action === 'on';
    const result = await sendCommand(deviceId, on);

    if (result.success) {
      res.status(200).json({ success: true, action, deviceId });
    } else {
      res.status(500).json({ success: false, error: result.msg || 'Tuya xatosi', details: result });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
