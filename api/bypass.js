// /api/bypass.js
const url = require('url');
const getCurrentTime = () => process.hrtime.bigint();

// Format time as X.XXs (e.g. 1.23s, 0.05s)
const formatDuration = (startNs, endNs = process.hrtime.bigint()) => {
  const durationNs = Number(endNs - startNs);
  const durationSec = durationNs / 1_000_000_000;
  return `${durationSec.toFixed(2)}s`; // ← 2 decimal places
};

const tryParseJson = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return null; }
};

const normalizeToMinimal = (raw, measuredTime) => {
  const obj = typeof raw === 'object' ? raw : tryParseJson(raw);

  let result = obj?.result ?? obj?.message ?? obj?.error ?? obj?.data ?? null;
  let status = null;

  if (obj?.status && typeof obj.status === 'string') {
    status = obj.status.toLowerCase() === 'success' ? 'success' : 'error';
  } else if (obj && (obj.status || obj.statusCode)) {
    const code = obj.status ?? obj.statusCode;
    status = (code >= 200 && code < 300) ? 'success' : 'error';
  }

  let timeTaken = obj?.time_taken ?? obj?.time ?? measuredTime;
  if (typeof timeTaken === 'number') timeTaken = `${timeTaken.toFixed(2)}s`;
  if (!timeTaken || timeTaken === '0') timeTaken = measuredTime;

  return { status, result, time_taken: timeTaken };
};

const isUnsupported = (msg) => {
  if (!msg) return false;
  const lower = msg.toString().toLowerCase();
  return /unsupported|not supported|not support/i.test(lower);
};

module.exports = async (req, res) => {
  const handlerStart = getCurrentTime();

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // === Allow both root (/) and /bypass ===
  const pathname = req.url.split('?')[0];
  const isRoot = pathname === '/' || pathname === '/bypass';

  // Show simple HTML form on root
  if (req.method === 'GET' && isRoot && !req.query.url) {
    return res.status(200).setHeader('Content-Type', 'text/html').send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Link Bypass API</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #0d1117; color: #c9d1d9; padding: 40px; text-align: center; }
          input, button { padding: 12px; margin: 10px; font-size: 16px; border-radius: 8px; border: none; }
          input { width: 70%; max-width: 600px; }
          button { background: #238636; color: white; cursor: pointer; width: 150px; }
          button:hover { background: #2ea043; }
          pre { text-align: left; background: #161b22; padding: 15px; border-radius: 8px; margin: 20px auto; max-width: 800px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <h1>Link Bypass API</h1>
        <form action="/bypass" method="GET">
          <input type="url" name="url" placeholder="Enter link to bypass..." required autofocus>
          <button type="submit">Bypass</button>
        </form>
        <p><small>Or use: <code>GET /bypass?url=https://example.com</code></small></p>
        <pre>{
  "status": "success",
  "result": "https://direct.link/here",
  "time_taken": "1.23s"
}</pre>
      </body>
      </html>
    `);
  }

  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({
      status: 'error',
      result: 'Method not allowed. Use GET or POST.',
      time_taken: formatDuration(handlerStart)
    });
  }

  // Extract URL from query (GET) or body (POST)
  const inputUrl = req.method === 'GET' ? req.query.url : (req.body?.url || null);
  if (!inputUrl) {
    return res.status(400).json({
      status: 'error',
      result: 'Missing url parameter',
      time_taken: formatDuration(handlerStart)
    });
  }

  let axios;
  try {
    axios = require('axios');
  } catch (e) {
    return res.status(500).json({
      status: 'error',
      result: 'Server error: axios not installed',
      time_taken: formatDuration(handlerStart)
    });
  }

  // === API CONFIG ===
  const EASX_API_URL = 'https://api.eas-x.com/v3/bypass';
  const EASX_API_KEY = process.env.EASX_API_KEY || '.john2032-3253f-3262k-3631f-2626j-9078k';

  const ACE_API_BASE = process.env.ACE_API_BASE || 'https://ace-bypass.com/api/bypass';
  const ACE_API_KEY = process.env.ACE_API_KEY || 'FREE_S7MdXC0momgajOEx1_UKW7FQUvbmzvalu0gTwr-V6cI';

  const VOLTAR_API_URL = 'http://77.110.121.76:3000/bypass';
  const VOLTAR_API_KEY = '3f9c1e10-7f3e-4a67-939b-b42c18e4d7aa';

  // === DOMAIN LISTS ===
  const voltarOnlyDomains = ['key.valex.io', 'auth.platoboost', 'work.ink', 'link4m.com', 'keyrblx.com', 'link4sub.com', 'linkify.ru', 'sub4unlock.io', 'sub2unlock'].map(d => d.toLowerCase());

  const easOnlyDomains = ['rentry.org', 'paster.so', 'loot-link.com', 'loot-links.com', 'lootlink.org', 'lootlinks.co', 'lootdest.info', 'lootdest.org', 'lootdest.com', 'links-loot.com', 'linksloot.net'].map(d => d.toLowerCase());

  const linkvertiseDomains = ['linkvertise.com', 'link-target.net', 'link-center.net', 'link-to.net'].map(d => d.toLowerCase());

  // === Get hostname ===
  let hostname = '';
  try {
    hostname = new URL(inputUrl).hostname.toLowerCase();
  } catch (e) {
    const match = inputUrl.match(/https?:\/\/([^\/?#]+)/i);
    hostname = match ? match[1].toLowerCase() : '';
  }

  const isHostInList = (list) => list.some(d => hostname === d || hostname.endsWith('.' + d));

  // === Decide fallback order ===
  let candidates = [];

  if (isHostInList(voltarOnlyDomains)) {
    candidates = [{ type: 'voltar' }];
  } else if (isHostInList(easOnlyDomains)) {
    candidates = [{ type: 'easx' }];
  } else if (isHostInList(linkvertiseDomains)) {
    candidates = [{ type: 'voltar' }, { type: 'easx' }, { type: 'ace' }];
  } else {
    candidates = [{ type: 'voltar' }, { type: 'ace' }, { type: 'easx' }];
  }

  let finalResult = null;

  for (const candidate of candidates) {
    const apiStart = getCurrentTime();

    try {
      let response;

      if (candidate.type === 'voltar') {
        response = await axios.post(VOLTAR_API_URL, { url: inputUrl }, {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': VOLTAR_API_KEY
          },
          timeout: 15000
        });
      } else if (candidate.type === 'easx') {
        response = await axios.post(EASX_API_URL, { url: inputUrl }, {
          headers: {
            'accept': 'application/json',
            'eas-api-key': EASX_API_KEY,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        });
      } else { // ace
        const aceUrl = `${ACE_API_BASE}?url=${encodeURIComponent(inputUrl)}&apikey=${ACE_API_KEY}`;
        response = await axios.get(aceUrl, { timeout: 15000 });
      }

      const measured = formatDuration(apiStart);

      const { status, result: apiResult } = normalizeToMinimal(response.data, measured);

      if (status === 'success' && apiResult) {
        return res.json({
          status: 'success',
          result: apiResult,
          time_taken: measured
        });
      }

      // Handle known unsupported messages
      if (apiResult && isUnsupported(apiResult)) {
        finalResult = { status: 'error', result: 'Link Not Supported Rip', time_taken: measured };
      } else {
        finalResult = { status: 'error', result: 'Bypass Failed :(', time_taken: measured };
      }

      // Don't continue fallback for forced domains
      if (candidate.type === 'voltar' && isHostInList(voltarOnlyDomains)) break;
      if (candidate.type === 'easx' && isHostInList(easOnlyDomains)) break;

    } catch (err) {
      const measured = formatDuration(apiStart);
      let msg = 'Bypass Failed :(';

      if (err.response?.data) {
        const data = tryParseJson(err.response.data);
        const text = data?.message || data?.error || data?.result || '';
        if (isUnsupported(text)) msg = 'Link Not Supported Rip';
      } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        msg = 'Service unreachable';
      }

      finalResult = { status: 'error', result: msg, time_taken: measured };

      if (candidate.type === 'voltar' && isHostInList(voltarOnlyDomains)) break;
      if (candidate.type === 'easx' && isHostInList(easOnlyDomains)) break;
    }
  }

  // Final fallback response
  res.json({
    status: finalResult?.status || 'error',
    result: finalResult?.result || 'All bypass services failed',
    time_taken: finalResult?.time_taken || formatDuration(handlerStart)
  });
};
