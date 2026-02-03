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

const BACON_API = 'https://free.baconbypass.online/bypass';
const BACON_API_KEY = '9d94a66be3d84725422290841a93da785ecf26d47ce62f92';
const BACON_TIMEOUT = 120000;

const primaryHosts = new Set([
  'adfoc.us',
  'blog.tapvietcode.com',
  'blox-script.com',
  'boost.ink',
  'bst.gg',
  'bstshrt.com',
  'deltaios-executor.com',
  'go.linkify.ru',
  'krnl-ios.com',
  'ldnesfspublic.org',
  'link-unlock.com',
  'link4sub.com',
  'linkunlocker.com',
  'linkzy.space',
  'mboost.me',
  'mendationforc.info',
  'neoxsoftworks.eu',
  'nirbytes.com',
  'ntt-hub.xyz',
  'paste-drop.com',
  'pastebin.com',
  'pastefy.app',
  'rekonise.com',
  'rekonise.org',
  'rkns.link',
  'robloxscripts.gg',
  'scriptpastebins.com',
  'smplu.link',
  'social-unlock.com',
  'socialwolvez.com',
  'sub2get.com',
  'sub2unlock.com',
  'sub2unlock.io',
  'sub2unlock.me',
  'sub2unlock.top',
  'sub4unlock.co',
  'sub4unlock.com',
  'sub4unlock.pro',
  'subnise.com',
  'www.jinkx.pro'
]);

const fallbackHosts = new Set([
  'auth.platoboost.app',
  'auth.platoboost.me',
  'auth.platorelay.com',
  'link-center.net',
  'link-hub.net',
  'link-target.net',
  'link-to.net',
  'direct-link.net',
  'linkvertise.com'
]);

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
      console.error('Polling timeout reached after ' + attempts + ' attempts');
      return null;
    }

    if (attempts > 0) {
      await new Promise(r => setTimeout(r, CONFIG.POLL_INTERVAL));
    }
    attempts++;

    try {
      const resultRes = await axios.get(
        `${CONFIG.VOLTAR_BASE}/bypass/getTaskResult/${taskId}`,
        { headers, timeout: 0 }
      );

      const data = resultRes?.data;

      if (!data) {
        console.error(`Voltar returned empty response on attempt ${attempts}`);
        return null;
      }

      if (data.status === 'success' && data.result) {
        return data.result;
      }

      if (data.status === 'error' || data.status === 'failed' || data.error) {
        console.error(`Voltar task error (attempt ${attempts}): ${data.message || JSON.stringify(data)}`);
        return null;
      }

      if (data.message && /unsupported|invalid|not supported|failed/i.test(String(data.message))) {
        console.error(`Voltar task terminal message (attempt ${attempts}): ${data.message}`);
        return null;
      }

    } catch (err) {
      console.error(`Polling aborted due to error on attempt ${attempts}: ${err?.message || String(err)}`);
      return null;
    }
  }

  console.error('Max polling attempts reached: ' + CONFIG.MAX_POLL_ATTEMPTS);
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

    const createRes = await axios.post(
      `${CONFIG.VOLTAR_BASE}/bypass/createTask`,
      createPayload,
      { headers: voltarHeaders, timeout: 0 }
    );

    if (createRes?.data?.status !== 'success' || !createRes?.data?.taskId) {
      console.error('Voltar createTask failed or unsupported');
      return { success: false, unsupported: true };
    }

    const taskId = createRes.data.taskId;
    console.log('Voltar task created: ' + taskId);

    const pollHeaders = {
      'x-api-key': voltarHeaders['x-api-key'],
      'x-user-id': voltarHeaders['x-user-id']
    };

    const result = await pollTaskResult(axios, taskId, pollHeaders, start);

    if (result) {
      sendSuccess(res, result, incomingUserId, start);
      return { success: true };
    }

    console.error('Voltar polling failed to get result');
    return { success: false };

  } catch (e) {
    console.error('Voltar error: ' + (e?.message || String(e)));
    if (e?.response?.data?.message && /unsupported|invalid|not supported/i.test(e.response.data.message)) {
      return { success: false, unsupported: true };
    }
    return { success: false };
  }
};

const tryBacon = async (axios, url, incomingUserId, res, handlerStart) => {
  const start = getCurrentTime();

  try {
    const baconRes = await axios.get(
      `${BACON_API}?url=${encodeURIComponent(url)}`,
      {
        headers: {
          'x-api-key': BACON_API_KEY
        },
        timeout: BACON_TIMEOUT
      }
    );

    const data = baconRes.data;

    if (data.status === 'success' && data.result) {
      sendSuccess(res, data.result, incomingUserId, start);
      return { success: true };
    } else {
      console.error('Bacon failed: ' + (data.message || 'Unknown error'));
      return { success: false };
    }
  } catch (e) {
    console.error('Bacon error: ' + (e?.message || String(e)));
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

  let isPrimaryBacon = primaryHosts.has(hostname);
  if (isPrimaryBacon) {
    if (hostname === 'blox-script.com' && !url.includes('/get-key') && !url.includes('/subscribe')) isPrimaryBacon = false;
    if (hostname === 'nirbytes.com' && !url.includes('/sub2unlock/')) isPrimaryBacon = false;
    if (hostname === 'ntt-hub.xyz' && !url.includes('/key/')) isPrimaryBacon = false;
    if (hostname === 'smplu.link' && !url.includes('/Keysystem')) isPrimaryBacon = false;
    if (hostname === 'subnise.com' && !url.includes('/link/')) isPrimaryBacon = false;
  }

  const isFallbackBacon = fallbackHosts.has(hostname);

  if (hostname === 'paste.to' || hostname.endsWith('.paste.to')) {
    console.log('Handling paste.to URL');
    return await handlePasteTo(axios, url, incomingUserId, handlerStart, res);
  }

  if (hostname === 'get-key.keysystem2352.workers.dev' || hostname === 'get-key.keysystem352.workers.dev') {
    console.log('Handling keysystem URL');
    return await handleKeySystem(axios, url, incomingUserId, handlerStart, res);
  }

  if (isPrimaryBacon) {
    console.log('Attempting Bacon bypass first');
    const baconResult = await tryBacon(axios, url, incomingUserId, res, handlerStart);
    if (baconResult.success) {
      console.log('Bacon bypass successful');
      return;
    }
    console.log('Bacon failed, falling back to Voltar');
    const voltarResult = await tryVoltar(axios, url, incomingUserId, res, handlerStart);
    if (voltarResult.success) {
      console.log('Voltar bypass successful');
      return;
    }
  } else {
    console.log('Attempting Voltar bypass first');
    const voltarResult = await tryVoltar(axios, url, incomingUserId, res, handlerStart);
    if (voltarResult.success) {
      console.log('Voltar bypass successful');
      return;
    }
    if (isFallbackBacon) {
      console.log('Voltar failed, attempting Bacon as fallback');
      const baconResult = await tryBacon(axios, url, incomingUserId, res, handlerStart);
      if (baconResult.success) {
        console.log('Bacon bypass successful');
        return;
      }
    }
  }

  console.error('All bypass methods failed');
  return sendError(res, 500, 'Bypass Failed :(', handlerStart);
};