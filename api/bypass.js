const net = require('net');
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

const BT_KEY = 'bt_11abf887e8b9d2df169b48ce47e7cc8feefb3e75ed4ff8d6';

const BYPASSTOOLS_CONFIG = {
  BASE: 'https://api.bypass.tools/api/v1/bypass',
  API_KEY: BT_KEY
};

const USER_RATE_LIMIT = new Map();

const extractHostname = (url) => {
  try {
    let u = new URL(url);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

const sanitizeUrl = (url) => {
  if (typeof url !== 'string') return url;
  return url.trim().replace(/[\r\n\t]/g, '');
};

const isPrivateHostname = (hostname) => {
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname === '::1' || hostname === '0.0.0.0' || hostname === '127.0.0.1') return true;
  if (net.isIPv4(hostname)) {
    const parts = hostname.split('.');
    if (
      parts[0] === '10' ||
      (parts[0] === '172' && parseInt(parts[1], 10) >= 16 && parseInt(parts[1], 10) <= 31) ||
      (parts[0] === '192' && parts[1] === '168')
    ) {
      return true;
    }
  } else if (net.isIPv6(hostname)) {
    // Simplified check for fc00::/7 unique local addresses
    if (hostname.toLowerCase().startsWith('fc') || hostname.toLowerCase().startsWith('fd')) {
      return true;
    }
  }
  return false;
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

const sendSuccess = (res, result, userId, startTime, isArray = false) =>
  res.json({
    status: 'success',
    [isArray ? 'results' : 'result']: result,
    x_user_id: userId || '',
    time_taken: formatDuration(startTime)
  });

const tryBypassTools = async (axios, url) => {
  const headers = {
    'x-api-key': BYPASSTOOLS_CONFIG.API_KEY,
    'Content-Type': 'application/json'
  };
  const body = {
    url: url,
    refresh: false
  };
  try {
    const res = await axios.post(`${BYPASSTOOLS_CONFIG.BASE}/direct`, body, { headers });
    const data = res.data;
    if (data.status === 'success' && data.result) {
      return { success: true, result: data.result };
    } else {
      return { success: false, error: data.message || 'Bypass failed' };
    }
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
};

const API_REGISTRY = {
  bypassTools: tryBypassTools
};

const getApiChain = (hostname) => {
  return ['bypassTools'];
};

const executeApiChain = async (axios, url, apiNames) => {
  let lastError = null;
  const promises = apiNames.map(name => API_REGISTRY[name](axios, url));
  const results = await Promise.allSettled(promises);
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled' && results[i].value.success) {
      return { success: true, result: results[i].value.result };
    } else if (results[i].status === 'fulfilled') {
      lastError = results[i].value.error || 'Unknown error';
    } else {
      lastError = results[i].reason?.message || 'Unknown error';
    }
  }
  return { success: false, error: lastError };
};

const headerRegex = /Not Found\s*\(#404\)/i;
const sentenceRegex = /This page is no longer available\.[\s\S]*?Pastebin staff\./i;

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
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'none'; object-src 'none';");
};

let axiosInstance = null;

module.exports = async (req, res) => {
  const handlerStart = getCurrentTime();
  setCorsHeaders(req, res);

  if (req.url === '/health' || req.url === '/health/') {
    return res.status(200).json({ status: 'ok' });
  }

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!CONFIG.SUPPORTED_METHODS.includes(req.method)) {
    return sendError(res, 405, 'Method not allowed', handlerStart);
  }
  let url = req.method === 'GET' ? req.query.url : req.body?.url;
  if (!url) {
    return sendError(res, 400, 'Missing URL parameter', handlerStart);
  }
  const incomingUserId = getUserId(req);
  const userKey = incomingUserId || req.headers['x-forwarded-for'] || req.ip || 'anonymous';
  const now = Date.now();
  if (!USER_RATE_LIMIT.has(userKey)) USER_RATE_LIMIT.set(userKey, []);
  let times = USER_RATE_LIMIT.get(userKey);
  times = times.filter(t => now - t < CONFIG.RATE_LIMIT_WINDOW_MS);
  if (Array.isArray(url)) {
    if (url.length > 5 || url.some(u => typeof u !== 'string')) {
      return sendError(res, 400, 'Invalid URLs array (max 5 strings)', handlerStart);
    }
    if (times.length >= CONFIG.MAX_REQUESTS_PER_WINDOW) {
      const timeLeft = Math.ceil((CONFIG.RATE_LIMIT_WINDOW_MS - (now - times[0])) / 1000);
      return sendError(res, 429, `Rate limit reached. Try again in ${timeLeft} seconds.`, handlerStart);
    }
    times.push(now);
    USER_RATE_LIMIT.set(userKey, times);
    if (!axiosInstance) {
      axiosInstance = require('axios').create({
        timeout: 60000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BypassBot/2.0)' }
      });
    }
    const axios = axiosInstance;
    try {
      const results = await Promise.all(url.map(async (singleUrl) => {
        singleUrl = sanitizeUrl(singleUrl);
        if (singleUrl.length > 2048) return { error: 'URL too long' };
        if (!/^https:\/\//i.test(singleUrl)) return { error: 'URL must start with https://' };
        const hostname = extractHostname(singleUrl);
        if (!hostname || isPrivateHostname(hostname)) return { error: 'Invalid hostname' };
        if (hostname === 'pastebin.com' || hostname.endsWith('.pastebin.com')) {
          const pb = await checkPastebinNotFound(axios, singleUrl);
          if (pb && pb.found) return { error: pb.message };
        }
        const apiChain = getApiChain(hostname);
        if (!apiChain.length) return { error: 'Unsupported host' };
        const result = await executeApiChain(axios, singleUrl, apiChain);
        return result.success ? result.result : { error: result.error || 'Bypass failed' };
      }));
      return sendSuccess(res, results, incomingUserId, handlerStart, true);
    } catch (e) {
      return sendError(res, 500, 'Internal error', handlerStart);
    }
  } else {
    if (typeof url !== 'string') {
      return sendError(res, 400, 'URL must be a string or array', handlerStart);
    }
    if (times.length >= CONFIG.MAX_REQUESTS_PER_WINDOW) {
      const timeLeft = Math.ceil((CONFIG.RATE_LIMIT_WINDOW_MS - (now - times[0])) / 1000);
      return sendError(res, 429, `Rate limit reached. Try again in ${timeLeft} seconds.`, handlerStart);
    }
    times.push(now);
    USER_RATE_LIMIT.set(userKey, times);
    url = sanitizeUrl(url);
    if (url.length > 2048) {
      return sendError(res, 400, 'URL too long', handlerStart);
    }
    if (!/^https:\/\//i.test(url)) {
      return sendError(res, 400, 'URL must start with https://', handlerStart);
    }
    if (!axiosInstance) {
      axiosInstance = require('axios').create({
        timeout: 60000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BypassBot/2.0)' }
      });
    }
    const axios = axiosInstance;
    const hostname = extractHostname(url);
    if (!hostname || isPrivateHostname(hostname)) {
      return sendError(res, 400, 'Invalid hostname', handlerStart);
    }
    if (hostname === 'paste.to' || hostname.endsWith('.paste.to')) {
      const start = getCurrentTime();
      try {
        let parsed;
        try { parsed = new URL(url); } catch { parsed = null; }
        const key = parsed && parsed.hash ? parsed.hash.slice(1) : (url.split('#')[1] || '');
        if (!key) {
          return res.status(400).json({
            status: 'error',
            result: 'Missing paste key',
            time_taken: formatDuration(handlerStart)
          });
        }
        const jsonUrl = parsed ? (parsed.hash = '', parsed.toString()) : url.split('#')[0];
        const r = await axios.get(jsonUrl, {
          headers: { Accept: 'application/json, text/javascript, */*; q=0.01' }
        });
        const data = r.data;
        if (!data || !data.ct || !data.adata) {
          return res.status(500).json({
            status: 'error',
            result: 'Paste data not found',
            time_taken: formatDuration(handlerStart)
          });
        }
        let lib;
        try { lib = await import('privatebin-decrypt'); } catch { lib = require('privatebin-decrypt'); }
        const decryptFn =
          lib.decryptPrivateBin ||
          lib.default?.decryptPrivateBin ||
          lib.default ||
          lib;
        if (typeof decryptFn !== 'function') {
          return res.status(500).json({
            status: 'error',
            result: 'privatebin-decrypt export not recognized',
            time_taken: formatDuration(handlerStart)
          });
        }
        let decrypted;
        try {
          decrypted = await decryptFn({
            key,
            data: data.adata,
            cipherMessage: data.ct
          });
        } catch (e) {
          return res.status(500).json({
            status: 'error',
            result: `Decryption failed`,
            time_taken: formatDuration(handlerStart)
          });
        }
        return res.json({
          status: 'success',
          result: decrypted,
          time_taken: formatDuration(start)
        });
      } catch (e) {
        return res.status(500).json({
          status: 'error',
          result: `Paste.to handling failed`,
          time_taken: formatDuration(handlerStart)
        });
      }
    }

    if (hostname === 'get-key.keysystem352.workers.dev') {
      try {
        const r = await axios.get(url, {
          headers: { Accept: 'text/html' },
          responseType: 'text'
        });
        const html = typeof r.data === 'string' ? r.data : String(r.data);
        const structure = '<div class="container">\n    <div class="title">Your Access Key</div>\n    <div class="divider"></div>\n    <div class="key-text" id="keyText">';
        const index = html.indexOf(structure);
        if (index === -1) {
          return sendError(res, 500, 'Key structure not found', handlerStart);
        }
        const startIndex = index + structure.length;
        const endIndex = html.indexOf('</div>', startIndex);
        if (endIndex === -1) {
          return sendError(res, 500, 'Key end not found', handlerStart);
        }
        const key = html.substring(startIndex, endIndex).trim();
        if (!key.startsWith('KEY_')) {
          return sendError(res, 500, 'Invalid key format', handlerStart);
        }
        return sendSuccess(res, key, incomingUserId, handlerStart);
      } catch (e) {
        return sendError(res, 500, `Key extraction failed`, handlerStart);
      }
    }

    const apiChain = getApiChain(hostname);
    if (!apiChain || apiChain.length === 0) {
      return sendError(res, 400, 'Unsupported host', handlerStart);
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
    const upstreamMsg = result.error || 'Bypass Failed Try Again.';
    return sendError(res, 500, upstreamMsg, handlerStart);
  }
};