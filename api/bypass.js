const getCurrentTime = () => process.hrtime.bigint();
const formatDuration = (startNs, endNs = process.hrtime.bigint()) => {
  const durationNs = Number(endNs - startNs);
  const durationSec = durationNs / 1_000_000_000;
  return `${durationSec.toFixed(2)}s`;
};

const CONFIG = {
  SUPPORTED_METHODS: ['GET', 'POST']
};

const TRW_CONFIG = {
  BASE: 'https://trw.lat',
  API_KEY: 'TRW_FREE-GAY-15a92945-9b04-4c75-8337-f2a6007281e9',
  POLL_INTERVAL: 500
};

const RTAO_CONFIG = {
  BASE: 'https://rtao.lol',
  PATH: '/free/v2/bypass',
  API_KEY: 'RTaO_BtBKnXmuZPB0msCHlXyxS09ItC1yARpq'
};

const RTAO_ONLY_HOSTS = [
  'auth.platorelay.com',
  'auth.platoboost.me',
  'auth.platoboost.app',
  'shrinkme.click',
  'link-hub.net',
  'link-center.net',
  'direct-link.net',
  'link-target.net',
  'up-to-down.net',
  'rkns.link',
  'rekonise.com'
];

const RTAO_FIRST_TRW_FALLBACK_HOSTS = [
  'linkvertise.com'
];

const matchesHostList = (hostname, list) =>
  list.some(h => hostname === h || hostname.endsWith('.' + h));

const sendError = (res, statusCode, message, startTime) => {
  return res.status(statusCode).json({
    status: 'error',
    result: message,
    time_taken: formatDuration(startTime)
  });
};

const sendSuccess = (res, result, userId, startTime) => {
  return res.json({
    status: 'success',
    result,
    x_user_id: userId || '',
    time_taken: formatDuration(startTime)
  });
};

const getUserId = (req) => {
  if (req.method === 'POST') {
    return req.body?.['x_user_id'] || req.body?.['x-user-id'] || req.body?.xUserId || '';
  }
  return req.headers?.['x-user-id'] || req.headers?.['x_user_id'] || req.headers?.['x-userid'] || '';
};

const extractHostname = (url) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    const match = url.match(/https?:\/\/([^\/?#]+)/i);
    return match ? match[1].toLowerCase() : '';
  }
};

const tryTrwBypass = async (axios, url, headers) => {
  try {
    const res = await axios.get(`${TRW_CONFIG.BASE}/api/bypass`, {
      params: { url },
      headers,
      timeout: 0
    });
    const data = res.data;
    if (data.success && data.result) {
      return { success: true, result: data.result };
    }
    return { success: false };
  } catch (e) {
    console.error('TRW error: ' + (e?.message || String(e)));
    return { success: false };
  }
};

const tryTrwV2Bypass = async (axios, url, headers) => {
  try {
    const createRes = await axios.get(`${TRW_CONFIG.BASE}/api/v2/bypass`, {
      params: { url },
      headers,
      timeout: 0
    });
    const data = createRes.data;
    if (data.status === 'started' && data.ThreadID) {
      const taskId = data.ThreadID;
      while (true) {
        await new Promise(r => setTimeout(r, TRW_CONFIG.POLL_INTERVAL));
        try {
          const checkRes = await axios.get(`${TRW_CONFIG.BASE}/api/v2/threadcheck`, {
            params: { id: taskId },
            timeout: 0
          });
          const checkData = checkRes.data;
          if (checkData.status === 'Done' && checkData.success && checkData.result) {
            return { success: true, result: checkData.result };
          }
          if (checkData.status === 'error' || checkData.status === 'failed' || checkData.error) {
            console.error('TRW V2 task failed: ' + (checkData.message || JSON.stringify(checkData)));
            return { success: false };
          }
        } catch (pollErr) {
          console.error('TRW V2 poll error: ' + (pollErr?.message || String(pollErr)));
          return { success: false };
        }
      }
    }
    return { success: false };
  } catch (e) {
    console.error('TRW V2 error: ' + (e?.message || String(e)));
    return { success: false };
  }
};

const tryTrw = async (axios, url) => {
  const trwHeaders = { 'x-api-key': TRW_CONFIG.API_KEY };
  let result = await tryTrwBypass(axios, url, trwHeaders);
  if (!result.success) {
    console.log('TRW V1 failed, attempting TRW V2 as fallback');
    result = await tryTrwV2Bypass(axios, url, trwHeaders);
  }
  return result;
};

const tryRtaoBypass = async (axios, url) => {
  try {
    const res = await axios.get(`${RTAO_CONFIG.BASE}${RTAO_CONFIG.PATH}`, {
      params: { url },
      headers: {
        'x-api-key': RTAO_CONFIG.API_KEY
      },
      timeout: 0
    });
    const data = res.data;
    if ((data.success && data.result) || data.result) {
      return { success: true, result: data.result };
    }
    return { success: false };
  } catch (e) {
    console.error('RTAO error: ' + (e?.message || String(e)));
    return { success: false };
  }
};

const handlePasteTo = async (axios, url, incomingUserId, handlerStart, res) => {
  const start = getCurrentTime();
  try {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    const key = parsed && parsed.hash ? parsed.hash.slice(1) : (url.split('#')[1] || '');
    if (!key) {
      return sendError(res, 400, 'Missing paste key', handlerStart);
    }
    let jsonUrl;
    if (parsed) {
      const tmp = new URL(parsed.toString());
      tmp.hash = '';
      jsonUrl = tmp.toString();
    } else {
      jsonUrl = url.split('#')[0];
    }
    const r = await axios.get(jsonUrl, {
      headers: { Accept: 'application/json, text/javascript, */*; q=0.01' },
      timeout: 0
    });
    const data = r.data;
    if (!data || !data.ct || !data.adata) {
      return sendError(res, 500, 'Paste data not found', handlerStart);
    }
    let lib;
    try {
      lib = await import('privatebin-decrypt');
    } catch {
      lib = require('privatebin-decrypt');
    }
    const decryptFn = lib.decryptPrivateBin || lib.default?.decryptPrivateBin || lib.default || lib;
    if (typeof decryptFn !== 'function') {
      return sendError(res, 500, 'privatebin-decrypt export not recognized', handlerStart);
    }
    let decrypted;
    try {
      decrypted = await decryptFn({ key, data: data.adata, cipherMessage: data.ct });
    } catch (e) {
      return sendError(res, 500, `Decryption failed: ${String(e?.message || e)}`, handlerStart);
    }
    return sendSuccess(res, decrypted, incomingUserId, start);
  } catch (e) {
    console.error('Paste.to handling error: ' + (e?.message || String(e)));
    return sendError(res, 500, `Paste.to handling failed: ${String(e?.message || e)}`, handlerStart);
  }
};

const handleKeySystem = async (axios, url, incomingUserId, handlerStart, res) => {
  const start = getCurrentTime();
  try {
    const r = await axios.get(url, {
      headers: { Accept: 'text/html,*/*' },
      timeout: 0
    });
    const body = String(r.data || '');
    const match = body.match(/id=["']keyText["'][^>]*>\s*([\s\S]*?)\s*<\/div>/i);
    if (!match) {
      return sendError(res, 500, 'keyText not found', handlerStart);
    }
    const keyText = match[1].trim();
    return sendSuccess(res, keyText, incomingUserId, start);
  } catch (e) {
    console.error('KeySystem handling error: ' + (e?.message || String(e)));
    return sendError(res, 500, `Key fetch failed: ${String(e?.message || e)}`, handlerStart);
  }
};

const setCorsHeaders = (req, res) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-user-id,x_user_id,x-userid,x-api-key');
};

const sanitizeUrl = (url) => {
  if (typeof url !== 'string') return url;
  return url.trim().replace(/[\r\n\t]/g, '');
};

module.exports = async (req, res) => {
  const handlerStart = getCurrentTime();
  console.log(`[${new Date().toISOString()}] ${req.method} request received`);
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (!CONFIG.SUPPORTED_METHODS.includes(req.method)) {
    console.error('Method not allowed: ' + req.method);
    return sendError(res, 405, 'Method not allowed', handlerStart);
  }

  let url = req.method === 'GET' ? req.query.url : req.body?.url;
  if (!url || typeof url !== 'string') {
    console.error('Missing or invalid url parameter');
    return sendError(res, 400, 'Missing url parameter', handlerStart);
  }
  url = sanitizeUrl(url);

  let axios;
  try {
    axios = require('axios');
  } catch {
    console.error('axios module missing');
    return sendError(res, 500, 'axios missing', handlerStart);
  }

  const hostname = extractHostname(url);
  if (!hostname) {
    console.error('Invalid URL provided: ' + url);
    return sendError(res, 400, 'Invalid URL', handlerStart);
  }
  console.log('Processing URL with hostname: ' + hostname);

  const incomingUserId = getUserId(req);

  if (hostname === 'paste.to' || hostname.endsWith('.paste.to')) {
    console.log('Handling paste.to URL');
    return await handlePasteTo(axios, url, incomingUserId, handlerStart, res);
  }

  if (hostname === 'get-key.keysystem2352.workers.dev' || hostname === 'get-key.keysystem352.workers.dev') {
    console.log('Handling keysystem URL');
    return await handleKeySystem(axios, url, incomingUserId, handlerStart, res);
  }

  if (matchesHostList(hostname, RTAO_ONLY_HOSTS)) {
    console.log('Host is RTAO-only, attempting RTAO');
    const rtaoResult = await tryRtaoBypass(axios, url);
    if (rtaoResult.success) {
      return sendSuccess(res, rtaoResult.result, incomingUserId, handlerStart);
    }
    console.error('RTAO failed for RTAO-only host');
    return sendError(res, 500, 'Bypass Failed :(', handlerStart);
  }

  if (matchesHostList(hostname, RTAO_FIRST_TRW_FALLBACK_HOSTS)) {
    console.log('Host uses RTAO first with TRW fallback, attempting RTAO');
    const rtaoResult = await tryRtaoBypass(axios, url);
    if (rtaoResult.success) {
      return sendSuccess(res, rtaoResult.result, incomingUserId, handlerStart);
    }
    console.log('RTAO failed, falling back to TRW');
    const trwResult = await tryTrw(axios, url);
    if (trwResult.success) {
      return sendSuccess(res, trwResult.result, incomingUserId, handlerStart);
    }
    console.error('All bypass methods failed for RTAO then TRW host');
    return sendError(res, 500, 'Bypass Failed :(', handlerStart);
  }

  console.log('Attempting TRW only');
  const trwResult = await tryTrw(axios, url);
  if (trwResult.success) {
    return sendSuccess(res, trwResult.result, incomingUserId, handlerStart);
  }

  console.error('All bypass methods failed');
  return sendError(res, 500, 'Bypass Failed :(', handlerStart);
};