const getCurrentTime = () => process.hrtime.bigint();
const formatDuration = (startNs, endNs = process.hrtime.bigint()) => {
  const durationNs = Number(endNs - startNs);
  const durationSec = durationNs / 1_000_000_000;
  return `${durationSec.toFixed(2)}s`;
};

const CONFIG = {
  VOLTAR_BASE: 'https://api.voltar.lol',
  VOLTAR_API_KEY: '3f9c1e10-7f3e-4a67-939b-b42c18e4d7aa',
  MAX_POLL_ATTEMPTS: 90,
  POLL_INTERVAL: 100,
  POLL_TIMEOUT: 90000,
  SUPPORTED_METHODS: ['GET', 'POST']
};

const TRW_BASE = 'https://trw.lat/api/bypass';
const TRW_KEY = 'TRW_FREE-GAY-15a92945-9b04-4c75-8337-f2a6007281e9';
const TRW_TIMEOUT = 90000;

const BACON_BASE = 'https://free.baconbypass.online';
const BACON_KEY = '9d94a66be3d84725422290841a93da785ecf26d47ce62f92';
const BACON_TIMEOUT = 120000;
const BACON_RATE_WINDOW_MS = 7000;
const BACON_RATE_MAX = 3;

const BACON_FIRST_LIST = [
  'https://adfoc.us/',
  'https://blog.tapvietcode.com/',
  'https://blox-script.com/get-key',
  'https://blox-script.com/subscribe',
  'https://boost.ink/',
  'https://bst.gg/',
  'https://bstshrt.com/',
  'https://deltaios-executor.com/',
  'https://go.linkify.ru/',
  'https://krnl-ios.com/',
  'https://ldnesfspublic.org/',
  'https://link-unlock.com/',
  'https://link4sub.com/',
  'https://linkunlocker.com/',
  'https://linkzy.space/',
  'https://mboost.me/',
  'https://mendationforc.info/',
  'https://neoxsoftworks.eu/',
  'https://nirbytes.com/sub2unlock/',
  'https://ntt-hub.xyz/key/get-key?hwid=',
  'https://ntt-hub.xyz/key/ntt-hub.html?hwid=',
  'https://paste-drop.com/',
  'https://pastebin.com/',
  'https://pastefy.app/',
  'https://rekonise.com/',
  'https://rekonise.org/',
  'https://rkns.link/',
  'https://robloxscripts.gg/',
  'https://scriptpastebins.com/',
  'https://smplu.link/Keysystem',
  'https://social-unlock.com/',
  'https://socialwolvez.com/',
  'https://sub2get.com/',
  'https://sub2unlock.com/',
  'https://sub2unlock.io/',
  'https://sub2unlock.me/',
  'https://sub2unlock.top/',
  'https://sub4unlock.co/',
  'https://sub4unlock.com/',
  'https://sub4unlock.pro/',
  'https://subnise.com/link/',
  'https://www.jinkx.pro/'
].map(s => s.toLowerCase());

const BACON_FALLBACK_LIST = [
  'https://link-center.net/',
  'https://link-hub.net/',
  'https://link-target.net/',
  'https://link-to.net/',
  'https://direct-link.net/'
].map(s => s.toLowerCase());

const baconFallbackHosts = BACON_FALLBACK_LIST.map(u => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return u.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  }
});

let baconCallTimestamps = [];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const ensureBaconRateLimit = async () => {
  const now = Date.now();
  baconCallTimestamps = baconCallTimestamps.filter(ts => now - ts < BACON_RATE_WINDOW_MS);
  if (baconCallTimestamps.length < BACON_RATE_MAX) {
    baconCallTimestamps.push(now);
    return;
  }
  const earliest = baconCallTimestamps[0];
  const waitMs = BACON_RATE_WINDOW_MS - (now - earliest) + 10;
  await sleep(waitMs);
  const afterNow = Date.now();
  baconCallTimestamps = baconCallTimestamps.filter(ts => afterNow - ts < BACON_RATE_WINDOW_MS);
  baconCallTimestamps.push(afterNow);
};

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

const pollTaskResult = async (axios, taskId, headers, startTime) => {
  let attempts = 0;
  const pollStart = Date.now();
  while (attempts < CONFIG.MAX_POLL_ATTEMPTS) {
    if (Date.now() - pollStart > CONFIG.POLL_TIMEOUT) {
      return null;
    }
    if (attempts > 0) {
      await new Promise(r => setTimeout(r, CONFIG.POLL_INTERVAL));
    }
    attempts++;
    try {
      const resultRes = await axios.get(`${CONFIG.VOLTAR_BASE}/bypass/getTaskResult/${taskId}`, { headers, timeout: 0 });
      const data = resultRes?.data;
      if (!data) {
        return null;
      }
      if (data.status === 'success' && data.result) {
        return data.result;
      }
      if (data.status === 'error' || data.status === 'failed' || data.error) {
        return null;
      }
      if (data.message && /unsupported|invalid|not supported|failed/i.test(String(data.message))) {
        return null;
      }
    } catch (err) {
      return null;
    }
  }
  return null;
};

const tryVoltar = async (axios, url, incomingUserId, res, handlerStart) => {
  const start = getCurrentTime();
  const voltarHeaders = {
    'x-user-id': incomingUserId || '',
    'x-api-key': CONFIG.VOLTAR_API_KEY,
    'Content-Type': 'application/json'
  };
  try {
    const createPayload = { url, cache: true };
    if (incomingUserId) createPayload.x_user_id = incomingUserId;
    const createRes = await axios.post(`${CONFIG.VOLTAR_BASE}/bypass/createTask`, createPayload, { headers: voltarHeaders, timeout: 0 });
    if (createRes?.data?.status !== 'success' || !createRes?.data?.taskId) {
      return { success: false, unsupported: true };
    }
    const taskId = createRes.data.taskId;
    const pollHeaders = {
      'x-api-key': voltarHeaders['x-api-key'],
      'x-user-id': voltarHeaders['x-user-id']
    };
    const result = await pollTaskResult(axios, taskId, pollHeaders, start);
    if (result) {
      sendSuccess(res, result, incomingUserId, start);
      return { success: true };
    }
    return { success: false };
  } catch (e) {
    if (e?.response?.data?.message && /unsupported|invalid|not supported/i.test(e.response.data.message)) {
      return { success: false, unsupported: true };
    }
    return { success: false };
  }
};

const tryTRW = async (axios, url, incomingUserId, res, handlerStart) => {
  const start = getCurrentTime();
  try {
    const requestUrl = `${TRW_BASE}?url=${encodeURIComponent(url)}`;
    const r = await axios.get(requestUrl, { headers: { 'x-api-key': TRW_KEY }, timeout: TRW_TIMEOUT });
    const data = r?.data || {};
    const successFlag = data.success === true || String(data.success).toLowerCase() === 'true';
    let candidateResult = '';
    if (typeof data.result === 'string' && data.result) {
      candidateResult = data.result;
    } else if (data.result && typeof data.result === 'object') {
      if (typeof data.result.result === 'string' && data.result.result) {
        candidateResult = data.result.result;
      } else if (typeof data.result.destination === 'string' && data.result.destination) {
        candidateResult = data.result.destination;
      } else if (typeof data.result.url === 'string' && data.result.url) {
        candidateResult = data.result.url;
      }
    } else if (typeof data.destination === 'string' && data.destination) {
      candidateResult = data.destination;
    } else if (typeof data.url === 'string' && data.url) {
      candidateResult = data.url;
    }
    if (successFlag && candidateResult) {
      sendSuccess(res, candidateResult, incomingUserId, start);
      return { success: true };
    }
    return { success: false };
  } catch (e) {
    return { success: false };
  }
};

const tryBacon = async (axios, url, incomingUserId, res, handlerStart) => {
  const start = getCurrentTime();
  try {
    await ensureBaconRateLimit();
    const requestUrl = `${BACON_BASE}/bypass?url=${encodeURIComponent(url)}`;
    const r = await axios.get(requestUrl, { headers: { 'x-api-key': BACON_KEY }, timeout: BACON_TIMEOUT });
    const data = r?.data || {};
    const statusString = String(data.status || '').toLowerCase();
    let candidateResult = '';
    if (typeof data.result === 'string' && data.result) {
      candidateResult = data.result;
    } else if (data.result && typeof data.result === 'object') {
      if (typeof data.result.result === 'string' && data.result.result) {
        candidateResult = data.result.result;
      } else if (typeof data.result.destination === 'string' && data.result.destination) {
        candidateResult = data.result.destination;
      }
    } else if (typeof data.destination === 'string' && data.destination) {
      candidateResult = data.destination;
    } else if (typeof data.url === 'string' && data.url) {
      candidateResult = data.url;
    }
    if (statusString === 'success' && candidateResult) {
      sendSuccess(res, candidateResult, incomingUserId, start);
      return { success: true };
    }
    if (statusString === 'error') {
      const msg = typeof data.message === 'string' && data.message ? data.message : 'Bacon bypass error';
      sendError(res, 500, msg, start);
      return { success: false, handled: true };
    }
    return { success: false };
  } catch (e) {
    if (e?.response?.data && typeof e.response.data === 'object' && String(e.response.data.status || '').toLowerCase() === 'error' && typeof e.response.data.message === 'string') {
      const msg = e.response.data.message;
      sendError(res, 500, msg, start);
      return { success: false, handled: true };
    }
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
    const r = await axios.get(jsonUrl, { headers: { Accept: 'application/json, text/javascript, */*; q=0.01' }, timeout: 0 });
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
    return sendError(res, 500, `Paste.to handling failed: ${String(e?.message || e)}`, handlerStart);
  }
};

const handleKeySystem = async (axios, url, incomingUserId, handlerStart, res) => {
  const start = getCurrentTime();
  try {
    const r = await axios.get(url, { headers: { Accept: 'text/html,*/*' }, timeout: 0 });
    const body = String(r.data || '');
    const match = body.match(/id=["']keyText["'][^>]*>\s*([\s\S]*?)\s*<\/div>/i);
    if (!match) {
      return sendError(res, 500, 'keyText not found', handlerStart);
    }
    const keyText = match[1].trim();
    return sendSuccess(res, keyText, incomingUserId, start);
  } catch (e) {
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
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (!CONFIG.SUPPORTED_METHODS.includes(req.method)) {
    return sendError(res, 405, 'Method not allowed', handlerStart);
  }
  let url = req.method === 'GET' ? req.query.url : req.body?.url;
  if (!url || typeof url !== 'string') {
    return sendError(res, 400, 'Missing url parameter', handlerStart);
  }
  url = sanitizeUrl(url);
  let axios;
  try {
    axios = require('axios');
  } catch {
    return sendError(res, 500, 'axios missing', handlerStart);
  }
  const hostname = extractHostname(url);
  if (!hostname) {
    return sendError(res, 400, 'Invalid URL', handlerStart);
  }
  const incomingUserId = getUserId(req);

  if (hostname === 'paste.to' || hostname.endsWith('.paste.to')) {
    return await handlePasteTo(axios, url, incomingUserId, handlerStart, res);
  }
  if (hostname === 'get-key.keysystem2352.workers.dev' || hostname === 'get-key.keysystem352.workers.dev') {
    return await handleKeySystem(axios, url, incomingUserId, handlerStart, res);
  }

  const urlLower = url.toLowerCase();
  const isBaconFirst = BACON_FIRST_LIST.some(prefix => urlLower.startsWith(prefix));
  const isBaconFallback = baconFallbackHosts.some(h => hostname === h || hostname.endsWith('.' + h) || urlLower.includes(h));

  try {
    if (hostname === 'linkvertise.com' || hostname.endsWith('.linkvertise.com') || urlLower.includes('linkvertise.com')) {
      const voltarResult = await tryVoltar(axios, url, incomingUserId, res, handlerStart);
      if (voltarResult.success) return;
      if (isBaconFirst || isBaconFallback) {
        const baconRes = await tryBacon(axios, url, incomingUserId, res, handlerStart);
        if (baconRes.success) return;
        if (baconRes.handled) return;
      }
      const trwRes = await tryTRW(axios, url, incomingUserId, res, handlerStart);
      if (trwRes.success) return;
      return sendError(res, 500, 'Bypass Failed :(', handlerStart);
    }

    if (hostname === 'cuty.io' || hostname.endsWith('.cuty.io') || urlLower.includes('cuty.io')) {
      const trwRes = await tryTRW(axios, url, incomingUserId, res, handlerStart);
      if (trwRes.success) return;
      const voltarResult = await tryVoltar(axios, url, incomingUserId, res, handlerStart);
      if (voltarResult.success) return;
      return sendError(res, 500, 'Bypass Failed :(', handlerStart);
    }

    if (hostname === 'work.ink' || hostname.endsWith('.work.ink') || urlLower.includes('work.ink')) {
      const voltarResult = await tryVoltar(axios, url, incomingUserId, res, handlerStart);
      if (voltarResult.success) return;
      return sendError(res, 500, 'Bypass Failed :(', handlerStart);
    }

    if (isBaconFirst) {
      const baconRes = await tryBacon(axios, url, incomingUserId, res, handlerStart);
      if (baconRes.success) return;
      if (baconRes.handled) return;
      const voltarResult = await tryVoltar(axios, url, incomingUserId, res, handlerStart);
      if (voltarResult.success) return;
      return sendError(res, 500, 'Bypass Failed :(', handlerStart);
    }

    if (isBaconFallback) {
      const voltarResult = await tryVoltar(axios, url, incomingUserId, res, handlerStart);
      if (voltarResult.success) return;
      const baconRes = await tryBacon(axios, url, incomingUserId, res, handlerStart);
      if (baconRes.success) return;
      if (baconRes.handled) return;
      return sendError(res, 500, 'Bypass Failed :(', handlerStart);
    }

    if (urlLower.startsWith('https://')) {
      const voltarResult = await tryVoltar(axios, url, incomingUserId, res, handlerStart);
      if (voltarResult.success) {
        return;
      }
      return sendError(res, 500, 'Bypass Failed :(', handlerStart);
    }

    const voltarResult = await tryVoltar(axios, url, incomingUserId, res, handlerStart);
    if (voltarResult.success) {
      return;
    }

    return sendError(res, 500, 'Bypass Failed :(', handlerStart);
  } catch (err) {
    return sendError(res, 500, `Internal handler error: ${String(err?.message || err)}`, handlerStart);
  }
};