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
  POLL_INTERVAL: 500,
  POLL_MAX_SECONDS: 120,
  MAX_POLLS: 300
};

const N0V4_CONFIG = {
  URL: 'https://n0v4-api.onrender.com/bypass'
};

const NYTRALIS_CONFIG = {
  URL: 'https://nytralis-linkvertise.onrender.com/bypass'
};

const HOST_RULES = {
  'auth.platorelay.com': ['n0v4'],
  'auth.platoboost.me': ['n0v4'],
  'auth.platoboost.app': ['n0v4'],
  'linkvertise.com': ['trw', 'nytralis'],
  'keyrblx.com': ['trwV2'],
  'work.ink': ['trw'],
  'workink.net': ['trw'],
  'cuty.io': ['trw']
};

const ABYSM_FIRST_HOSTS = [
  'socialwolvez.com',
  'scwz.me',
  'adfoc.us',
  'unlocknow.net',
  'sub2get.com',
  'sub4unlock.com',
  'sub2unlock.net',
  'sub2unlock.com',
  'mboost.me',
  'paste-drop.com',
  'pastebin.com',
  'boost.ink',
  'booo.st',
  'bst.gg',
  'bst.wtf',
  'linkunlocker.com',
  'unlk.link',
  'link-unlock.com',
  'direct-link.net',
  'link-target.net',
  'link-to.net',
  'link-center.net',
  'link-hub.net',
  'up-to-down.net',
  'linkvertise.com'
];

const matchesHostList = (hostname, list) =>
  list.some(h => hostname === h || hostname.endsWith('.' + h));

const extractHostname = (url) => {
  try {
    let u = new URL(url.startsWith('http') ? url : 'https://' + url);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    const match = url.match(/https?:\/\/(?:www\.)?([^\/?#]+)/i);
    return match ? match[1].toLowerCase() : '';
  }
};

const sanitizeUrl = (url) => {
  if (typeof url !== 'string') return url;
  return url.trim().replace(/[\r\n\t]/g, '');
};

const getUserId = (req) => {
  if (req.method === 'POST') {
    return req.body?.['x_user_id'] || req.body?.['x-user-id'] || req.body?.xUserId || '';
  }
  return req.headers?.['x-user-id'] || req.headers?.['x_user_id'] || req.headers?.['x-userid'] || '';
};

const sendError = (res, statusCode, message, startTime) =>
  res.status(statusCode).json({
    status: 'error',
    result: message,
    time_taken: formatDuration(startTime)
  });

const sendSuccess = (res, result, userId, startTime) =>
  res.json({
    status: 'success',
    result,
    x_user_id: userId || '',
    time_taken: formatDuration(startTime)
  });

const postProcessResult = (result) => {
  if (typeof result === 'string' && /^https?:\/\/ads\.luarmor\.net\//i.test(result)) {
    return `https://montelopiuy.pythonanywhere.com/redirect?to=${result}`;
  }
  return result;
};

const tryGenericGet = async (axios, apiUrl, url, headers, extractResult, retries = 2) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(apiUrl, {
        params: { url },
        headers
      });
      return extractResult(res.data);
    } catch (e) {
      if (attempt === retries) {
        return { success: false, error: e?.message || String(e) };
      }
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    }
  }
};

const tryTrw = (axios, url) =>
  tryGenericGet(axios, `${TRW_CONFIG.BASE}/api/bypass`, url, { 'x-api-key': TRW_CONFIG.API_KEY }, (data) =>
    data.success && data.result
      ? { success: true, result: data.result }
      : { success: false }
  );

const tryTrwV2 = async (axios, url) => {
  const headers = { 'x-api-key': TRW_CONFIG.API_KEY };
  try {
    const createRes = await axios.get(`${TRW_CONFIG.BASE}/api/v2/bypass`, {
      params: { url },
      headers,
      timeout: 0
    });
    const data = createRes.data;
    if (data.status !== 'started' || !data.ThreadID) return { success: false };
    const taskId = data.ThreadID;
    const pollStart = getCurrentTime();
    let pollCount = 0;
    while (true) {
      pollCount++;
      const elapsed = Number(getCurrentTime() - pollStart) / 1_000_000_000;
      if (elapsed > TRW_CONFIG.POLL_MAX_SECONDS || pollCount > TRW_CONFIG.MAX_POLLS) {
        console.error(`TRW V2 polling timeout reached after ${TRW_CONFIG.POLL_MAX_SECONDS}s`);
        return { success: false };
      }
      await new Promise(r => setTimeout(r, TRW_CONFIG.POLL_INTERVAL));
      try {
        const checkRes = await axios.get(`${TRW_CONFIG.BASE}/api/v2/threadcheck`, {
          params: { id: taskId },
          timeout: 0
        });
        const c = checkRes.data;
        if (c.status === 'Done' && c.success && c.result) return { success: true, result: c.result };
        if (c.status === 'error' || c.status === 'failed' || c.error) {
          console.error('TRW V2 task failed: ' + (c.message || JSON.stringify(c)));
          return { success: false };
        }
      } catch (pollErr) {
        console.error('TRW V2 poll error: ' + (pollErr?.message || String(pollErr)));
        return { success: false };
      }
    }
  } catch (e) {
    console.error('TRW V2 error: ' + (e?.message || String(e)));
    return { success: false };
  }
};

const tryN0v4 = (axios, url) =>
  tryGenericGet(axios, N0V4_CONFIG.URL, url, {}, (data) =>
    data && (data.result || data.data)
      ? { success: true, result: data.result || data.data }
      : { success: false }
  );

const tryNytralis = (axios, url) =>
  tryGenericGet(axios, NYTRALIS_CONFIG.URL, url, {}, (data) =>
    data && (data.result || data.data)
      ? { success: true, result: data.result || data.data }
      : { success: false }
  );

const tryAbysm = async (axios, url) => {
  try {
    const res = await axios.get('https://api.abysm.lat/v2/free/bypass', {
      params: { url }
    });
    const d = res.data;
    if (!d) return { success: false, error: 'No response from Abysm' };
    if (d.status === 'success' && d.data && d.data.result) {
      return { success: true, result: d.data.result, raw: d };
    }
    if (d.status === 'fail') {
      return { success: false, error: d.message || 'Abysm returned fail', abysmFail: true, raw: d };
    }
    if (d.result || (d.data && d.data.result)) {
      return { success: true, result: d.result || d.data.result, raw: d };
    }
    return { success: false, error: 'Abysm unexpected response', raw: d };
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
};

const API_REGISTRY = {
  abysm: tryAbysm,
  trw: tryTrw,
  trwV2: tryTrwV2,
  n0v4: tryN0v4,
  nytralis: tryNytralis
};

const getApiChain = (hostname) => {
  for (const [host, apis] of Object.entries(HOST_RULES)) {
    if (matchesHostList(hostname, [host])) {
      let chain = [...apis];
      if (chain.length === 1 && chain[0] !== 'trw') {
        chain.push('trw');
      }
      if (matchesHostList(hostname, ABYSM_FIRST_HOSTS)) {
        chain = ['abysm', ...chain.filter(a => a !== 'abysm')];
      }
      return chain;
    }
  }
  if (matchesHostList(hostname, ABYSM_FIRST_HOSTS)) {
    return ['abysm'];
  }
  return [];
};

const executeApiChain = async (axios, url, apiNames, hostname) => {
  const isAbysmHost = matchesHostList(hostname, ABYSM_FIRST_HOSTS);
  let abysmRetried = false;
  for (let i = 0; i < apiNames.length; i++) {
    const name = apiNames[i];
    const fn = API_REGISTRY[name];
    if (!fn) {
      console.error(`Unknown API in chain: ${name}`);
      continue;
    }
    console.log(`Attempting ${name}${i > 0 ? ' (fallback)' : ''}...`);
    const result = await fn(axios, url);
    if (result.success) {
      console.log(`${name} succeeded`);
      result.result = postProcessResult(result.result);
      return result;
    }
    if (name === 'abysm' && isAbysmHost && result.abysmFail && !abysmRetried) {
      abysmRetried = true;
      console.log('Abysm returned fail — retrying Abysm once (only) as requested...');
      const retryRes = await fn(axios, url);
      if (retryRes.success) {
        console.log('Abysm retry succeeded');
        retryRes.result = postProcessResult(retryRes.result);
        return retryRes;
      }
      console.log('Abysm retry failed');
    }
    console.log(`${name} failed${i < apiNames.length - 1 ? ', trying next...' : ''}`);
  }
  return { success: false };
};

const handlePasteTo = async (axios, url, incomingUserId, handlerStart, res) => {
  const start = getCurrentTime();
  try {
    let parsed;
    try { parsed = new URL(url); } catch { parsed = null; }
    const key = parsed && parsed.hash ? parsed.hash.slice(1) : (url.split('#')[1] || '');
    if (!key) return sendError(res, 400, 'Missing paste key', handlerStart);
    let jsonUrl;
    if (parsed) {
      const tmp = new URL(parsed.toString());
      tmp.hash = '';
      jsonUrl = tmp.toString();
    } else {
      jsonUrl = url.split('#')[0];
    }
    const r = await axios.get(jsonUrl, {
      headers: { Accept: 'application/json, text/javascript, */*; q=0.01' }
    });
    const data = r.data;
    if (!data || !data.ct || !data.adata) return sendError(res, 500, 'Paste data not found', handlerStart);
    let lib;
    try { lib = await import('privatebin-decrypt'); } catch { lib = require('privatebin-decrypt'); }
    const decryptFn = lib.decryptPrivateBin || lib.default?.decryptPrivateBin || lib.default || lib;
    if (typeof decryptFn !== 'function') return sendError(res, 500, 'privatebin-decrypt export not recognized', handlerStart);
    const decrypted = await decryptFn({ key, data: data.adata, cipherMessage: data.ct });
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
      headers: { Accept: 'text/html,*/*' }
    });
    const body = String(r.data || '');
    const match = body.match(/id=["']keyText["'][^>]*>\s*([\s\S]*?)\s*<\/div>/i);
    if (!match) return sendError(res, 500, 'keyText not found', handlerStart);
    return sendSuccess(res, match[1].trim(), incomingUserId, start);
  } catch (e) {
    console.error('KeySystem handling error: ' + (e?.message || String(e)));
    return sendError(res, 500, `Key fetch failed: ${String(e?.message || e)}`, handlerStart);
  }
};

const SPECIAL_HANDLERS = [
  {
    match: (h) => h === 'paste.to' || h.endsWith('.paste.to'),
    handler: handlePasteTo,
    label: 'paste.to'
  },
  {
    match: (h) => h === 'get-key.keysystem2352.workers.dev' || h === 'get-key.keysystem352.workers.dev',
    handler: handleKeySystem,
    label: 'keysystem'
  }
];

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

let axiosInstance = null;

module.exports = async (req, res) => {
  const handlerStart = getCurrentTime();
  console.log(`[${new Date().toISOString()}] ${req.method} request received`);
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
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
  if (!axiosInstance) {
    try {
      axiosInstance = require('axios').create({ timeout: 90000 });
    } catch {
      console.error('axios module missing');
      return sendError(res, 500, 'axios missing', handlerStart);
    }
  }
  const axios = axiosInstance;
  const hostname = extractHostname(url);
  if (!hostname) {
    console.error('Invalid URL provided: ' + url);
    return sendError(res, 400, 'Invalid URL', handlerStart);
  }
  const safeUrlLog = url.length > 80 ? url.substring(0, 80) + '...' : url;
  console.log('Processing URL with hostname: ' + hostname);
  const incomingUserId = getUserId(req);
  for (const special of SPECIAL_HANDLERS) {
    if (special.match(hostname)) {
      console.log(`Handling ${special.label} URL`);
      return await special.handler(axios, url, incomingUserId, handlerStart, res);
    }
  }
  const apiChain = getApiChain(hostname);
  console.log(`API chain for ${hostname}: [${apiChain.join(' \u2192 ')}]`);
  const result = await executeApiChain(axios, url, apiChain, hostname);
  if (result.success) {
    return sendSuccess(res, result.result, incomingUserId, handlerStart);
  }
  console.error('All bypass methods failed');
  return sendError(res, 500, 'Bypass Failed :(', handlerStart);
};