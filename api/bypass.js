const getCurrentTime = () => process.hrtime.bigint();
const formatDuration = (startNs, endNs = process.hrtime.bigint()) => {
  const durationNs = Number(endNs - startNs);
  const durationSec = durationNs / 1_000_000_000;
  return `${durationSec.toFixed(2)}s`;
};

const CONFIG = {
  SUPPORTED_METHODS: ['GET', 'POST'],
  RATE_LIMIT_WINDOW_MS: 60000,
  MAX_REQUESTS_PER_WINDOW: 15
};

const TRW_CONFIG = {
  BASE: 'https://trw.lat',
  API_KEY: 'TRW_FREE-GAY-15a92945-9b04-4c75-8337-f2a6007281e9',
  POLL_INTERVAL: 500,
  POLL_MAX_SECONDS: 120,
  MAX_POLLS: 300
};

const HOST_RULES = {
  'socialwolvez.com': ['abysmPaid', 'abysm'],
  'scwz.me': ['abysmPaid', 'abysm'],
  'adfoc.us': ['abysmPaid', 'abysm'],
  'unlocknow.net': ['abysmPaid', 'abysm'],
  'sub2get.com': ['abysmPaid', 'abysm'],
  'sub4unlock.com': ['abysmPaid', 'abysm'],
  'sub2unlock.net': ['abysmPaid', 'abysm'],
  'sub2unlock.com': ['abysmPaid', 'abysm'],
  'mboost.me': ['abysmPaid', 'abysm'],
  'paste-drop.com': ['abysmPaid', 'abysm'],
  'pastebin.com': ['abysmPaid', 'abysm'],
  'mobile.codex.lol': ['abysmPaid', 'abysm'],
  'lockr.so': ['abysmPaid', 'abysm'],
  'rentry.co': ['abysmPaid', 'abysm'],
  'deltaios-executor.com': ['abysmPaid', 'abysm'],
  'krnl-ios.com': ['abysmPaid', 'abysm'],
  'auth.platorelay.com': ['abysmPaid', 'abysm'],
  'auth.platoboost.me': ['abysmPaid', 'abysm'],
  'auth.platoboost.app': ['abysmPaid', 'abysm'],
  'auth.platoboost.net': ['abysmPaid', 'abysm'],
  'auth.platoboost.click': ['abysmPaid', 'abysm'],
  'rekonise.com': ['abysmPaid', 'abysm'],
  'rkns.link': ['abysmPaid', 'abysm'],
  'rekonise.org': ['abysmPaid', 'abysm'],
  'loot-link.com': ['abysmPaid', 'abysm'],
  'lootlink.org': ['abysmPaid', 'abysm'],
  'lootlinks.co': ['abysmPaid', 'abysm'],
  'lootdest.info': ['abysmPaid', 'abysm'],
  'lootdest.org': ['abysmPaid', 'abysm'],
  'lootdest.com': ['abysmPaid', 'abysm'],
  'links-loot.com': ['abysmPaid', 'abysm'],
  'loot-links.com': ['abysmPaid', 'abysm'],
  'best-links.org': ['abysmPaid', 'abysm'],
  'lootlinks.com': ['abysmPaid', 'abysm'],
  'loot-labs.com': ['abysmPaid', 'abysm'],
  'lootlabs.com': ['abysmPaid', 'abysm'],
  'boost.ink': ['abysmPaid', 'abysm'],
  'booo.st': ['abysmPaid', 'abysm'],
  'bst.gg': ['abysmPaid', 'abysm'],
  'bst.wtf': ['abysmPaid', 'abysm'],
  'linkunlocker.com': ['abysmPaid', 'abysm'],
  'unlk.link': ['abysmPaid', 'abysm'],
  'link-unlock.com': ['abysmPaid', 'abysm'],
  'krnl.cat': ['abysmPaid', 'abysm'],
  'linkvertise.com': ['abysmPaid', 'abysm', 'trw'],
  'keyrblx.com': ['trwV2'],
  'work.ink': ['trw'],
  'workink.net': ['trw'],
  'cuty.io': ['trw']
};

const USER_RATE_LIMIT = new Map();

const matchesHostList = (hostname, list) =>
  list.some(h => hostname === h || hostname.endsWith('.' + h));

const extractHostname = (url) => {
  try {
    let u = new URL(url.startsWith('http') ? url : 'https://' + url);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
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
    return `https://vortixworld-luarmor.vercel.app/redirect?to=${result}`;
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
      : { success: false, error: data?.error || data?.message || null }
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
    if (data.status !== 'started' || !data.ThreadID) return { success: false, error: data?.error || data?.message || null };
    const taskId = data.ThreadID;
    const pollStart = getCurrentTime();
    let pollCount = 0;
    while (true) {
      pollCount++;
      const elapsed = Number(getCurrentTime() - pollStart) / 1_000_000_000;
      if (elapsed > TRW_CONFIG.POLL_MAX_SECONDS || pollCount > TRW_CONFIG.MAX_POLLS) {
        return { success: false, error: 'TRW V2 poll timeout' };
      }
      await new Promise(r => setTimeout(r, TRW_CONFIG.POLL_INTERVAL + Math.random() * 100));
      try {
        const checkRes = await axios.get(`${TRW_CONFIG.BASE}/api/v2/threadcheck`, {
          params: { id: taskId },
          timeout: 0
        });
        const c = checkRes.data;
        if (c.status === 'Done' && c.success && c.result) return { success: true, result: c.result };
        if (c.status === 'error' || c.status === 'failed' || c.error) {
          return { success: false, error: c?.error || c?.message || 'trw v2 failed' };
        }
      } catch (e) {
        return { success: false, error: e?.message || String(e) };
      }
    }
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
};

const tryAbysmFree = async (axios, url) => {
  try {
    const res = await axios.get('https://api.abysm.lat/v2/free/bypass', {
      params: { url }
    });
    const d = res.data;
    if (d?.status === 'success' && d?.data?.result) {
      return { success: true, result: d.data.result };
    }
    if (d?.result) return { success: true, result: d.result };
    return { success: false, error: d?.error || d?.message || null };
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
};

const tryAbysmPaid = async (axios, url) => {
  try {
    const res = await axios.get('https://api.abysm.lat/v2/bypass', {
      params: { url },
      headers: { 'x-api-key': 'ABYSM-185EF369-E519-4670-969E-137F07BB52B8' },
      timeout: 90000
    });
    const d = res.data;
    if (d?.status === 'success' && d?.data?.result) {
      return { success: true, result: d.data.result };
    }
    if (d?.result) return { success: true, result: d.result };
    return { success: false, error: d?.error || d?.message || null };
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
};

const API_REGISTRY = {
  abysmPaid: tryAbysmPaid,
  abysm: tryAbysmFree,
  trw: tryTrw,
  trwV2: tryTrwV2
};

const getApiChain = (hostname) => {
  for (const [host, apis] of Object.entries(HOST_RULES)) {
    if (matchesHostList(hostname, [host])) {
      return [...apis];
    }
  }
  return [];
};

const executeApiChain = async (axios, url, apiNames) => {
  let lastError = null;
  for (let i = 0; i < apiNames.length; i++) {
    const name = apiNames[i];
    const fn = API_REGISTRY[name];
    if (!fn) continue;
    try {
      const result = await fn(axios, url);
      if (result && result.success) {
        let final = postProcessResult(result.result);
        return { success: true, result: final };
      } else {
        lastError = (result && (result.error || result.message || result.result)) || lastError || 'Unknown error from upstream API';
      }
    } catch (e) {
      lastError = e?.message || String(e);
    }
  }
  return { success: false, error: lastError };
};

const checkPastebinNotFound = async (axios, url) => {
  const candidates = [];
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    if (u.pathname.includes('/raw/')) {
      const pagePath = u.pathname.replace('/raw/', '/');
      const pageUrl = `${u.protocol}//${u.hostname}${pagePath}`.split('?')[0];
      candidates.push(pageUrl);
    }
  } catch {}
  candidates.push(url);
  for (let i = 0; i < candidates.length; i++) {
    try {
      const r = await axios.get(candidates[i], {
        timeout: 15000,
        headers: { Accept: 'text/html,application/xhtml+xml,text/plain' },
        responseType: 'text'
      });
      const html = typeof r.data === 'string' ? r.data : String(r.data);
      const headerRegex = /Not Found\s*\(#404\)/i;
      const sentenceRegex = /This page is no longer available\.[\s\S]*?Pastebin staff\./i;
      if (headerRegex.test(html) || sentenceRegex.test(html)) {
        const m = html.match(sentenceRegex);
        if (m && m[0]) {
          const cleaned = m[0].replace(/<\/?[^>]+(>|$)/g, '').trim();
          return { found: true, message: cleaned };
        }
        return { found: true, message: 'This page is no longer available. It has either expired, been removed by its creator, or removed by one of the Pastebin staff.' };
      }
    } catch (e) {
      continue;
    }
  }
  return { found: false };
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

let axiosInstance = null;

module.exports = async (req, res) => {
  const handlerStart = getCurrentTime();
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!CONFIG.SUPPORTED_METHODS.includes(req.method)) {
    return sendError(res, 405, 'Method not allowed', handlerStart);
  }
  let url = req.method === 'GET' ? req.query.url : req.body?.url;
  if (!url || typeof url !== 'string') {
    return sendError(res, 400, 'Missing url parameter', handlerStart);
  }
  url = sanitizeUrl(url);
  if (!/^https?:\/\//i.test(url)) {
    return sendError(res, 400, 'URL must start with http:// or https://', handlerStart);
  }
  if (!axiosInstance) {
    axiosInstance = require('axios').create({
      timeout: 90000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BypassBot/2.0)' }
    });
  }
  const axios = axiosInstance;
  const hostname = extractHostname(url);
  if (!hostname) {
    return sendError(res, 400, 'Invalid URL', handlerStart);
  }
  const incomingUserId = getUserId(req);
  const userKey = incomingUserId || req.headers['x-forwarded-for'] || req.ip || 'anonymous';
  const now = Date.now();
  if (!USER_RATE_LIMIT.has(userKey)) USER_RATE_LIMIT.set(userKey, []);
  let times = USER_RATE_LIMIT.get(userKey);
  times = times.filter(t => now - t < CONFIG.RATE_LIMIT_WINDOW_MS);
  times.push(now);
  USER_RATE_LIMIT.set(userKey, times);
  if (times.length > CONFIG.MAX_REQUESTS_PER_WINDOW) {
    return sendError(res, 429, 'Rate limit exceeded', handlerStart);
  }
  const apiChain = getApiChain(hostname);
  if (!apiChain || apiChain.length === 0) {
    return sendError(res, 400, 'No bypass method for host', handlerStart);
  }
  if (hostname === 'pastebin.com' || hostname.endsWith('.pastebin.com')) {
    const pb = await checkPastebinNotFound(axios, url);
    if (pb && pb.found) {
      return sendError(res, 404, pb.message, handlerStart);
    }
  }
  const result = await executeApiChain(axios, url, apiChain);
  if (result.success) {
    return sendSuccess(res, result.result, incomingUserId, handlerStart);
  }
  const upstreamMsg = result.error || result.message || result.result || 'Bypass failed';
  return sendError(res, 500, upstreamMsg, handlerStart);
};