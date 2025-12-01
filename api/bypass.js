// /api/bypass.js
const getCurrentTime = () => process.hrtime.bigint();

// Changed: toFixed(2) instead of toFixed(3) → 1.00s instead of 1.000s
const formatDuration = (startNs, endNs = process.hrtime.bigint()) => {
  const durationNs = Number(endNs - startNs);
  const durationMs = durationNs / 1_000_000;
  const durationSec = durationMs / 1000;
  return `${durationSec.toFixed(2)}s`;  // ← Now 2 decimal places
};

const tryParseJson = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return null; }
};

const normalizeToMinimal = (raw, measuredTime) => {
  const obj = (typeof raw === 'object') ? raw : tryParseJson(raw);

  let result = obj?.result ?? obj?.message ?? obj?.error ?? obj?.data ?? null;
  let status = null;

  if (obj && typeof obj.status === 'string') {
    status = obj.status.toLowerCase() === 'success' ? 'success' : 'error';
  } else if (obj && (obj.status || obj.statusCode)) {
    const code = obj.status ?? obj.statusCode;
    status = (code >= 200 && code < 300) ? 'success' : 'error';
  } else {
    status = null;
  }

  // Also ensure any incoming time_taken uses 2 decimals
  let timeTaken = obj?.time_taken ?? obj?.time ?? measuredTime;
  if (typeof timeTaken === 'number') {
    timeTaken = `${timeTaken.toFixed(2)}s`;
  }
  if (!timeTaken || timeTaken === '0.00s' || timeTaken === '0s') {
    timeTaken = measuredTime;
  }

  return { status, result, time_taken: timeTaken };
};

const isUnsupported = (msg) => {
  if (!msg) return false;
  const lower = msg.toString().toLowerCase();
  return /unsupported|not supported|not support/i.test(lower);
};

module.exports = async (req, res) => {
  const handlerStart = getCurrentTime();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({
      status: 'error',
      result: 'Method not allowed. Use GET or POST.',
      time_taken: formatDuration(handlerStart)
    });
  }

  const url = (req.method === 'GET' ? req.query.url : (req.body && req.body.url)) || null;
  if (!url) {
    return res.status(400).json({
      status: 'error',
      result: 'URL parameter is required',
      time_taken: formatDuration(handlerStart)
    });
  }

  // Fixed missing closing brace

  let axios;
  try {
    axios = require('axios');
  } catch (e) {
    return res.status(500).json({
      status: 'error',
      result: 'Missing dependency: axios',
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
  const voltarOnlyDomains = [
    'key.valex.io', 'auth.platoboost', 'work.ink', 'link4m.com',
    'keyrblx.com', 'link4sub.com', 'linkify.ru', 'sub4unlock.io', 'sub2unlock'
  ].map(d => d.toLowerCase());

  const easOnlyDomains = [
    'rentry.org', 'paster.so', 'loot-link.com', 'loot-links.com', 'lootlink.org',
    'lootlinks.co', 'lootdest.info', 'lootdest.org', 'lootdest.com', 'links-loot.com', 'linksloot.net'
  ].map(d => d.toLowerCase());

  const linkvertiseDomains = [
    'linkvertise.com', 'link-target.net', 'link-center.net', 'link-to.net'
  ].map(d => d.toLowerCase());

  // === Get hostname ===
  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch (e) {
    const match = url.match(/https?:\/\/([^\/]+)/i);
    hostname = match ? match[1].toLowerCase() : '';
  }

  const isHostInList = (list) => list.some(d => hostname === d || hostname.endsWith('.' + d));

  // === Decide API order ===
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

  let result = null;

  for (const candidate of candidates) {
    const apiStart = getCurrentTime();

    try {
      let response;

      if (candidate.type === 'voltar') {
        response = await axios.post(VOLTAR_API_URL, { url }, {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': VOLTAR_API_KEY
          }
        });
      } else if (candidate.type === 'easx') {
        response = await axios.post(EASX_API_URL, { url }, {
          headers: {
            'accept': 'application/json',
            'eas-api-key': EASX_API_KEY,
            'Content-Type': 'application/json'
          }
        });
      } else { // ace
        const aceUrl = `${ACE_API_BASE}?url=${encodeURIComponent(url)}&apikey=${ACE_API_KEY}`;
        response = await axios.get(aceUrl);
      }

      const measured = formatDuration(apiStart);
      const { status, result: apiResult } = normalizeToMinimal(response.data, measured);

      if (status === 'success' && apiResult) {
        return res.status(200).json({
          status: 'success',
          result: apiResult,
          time_taken: measured
        });
      }

      if (apiResult && isUnsupported(apiResult)) {
        result = { status: 'error', result: 'Link Not Supported Rip', time_taken: measured };
      } else {
        result = { status: 'error', result: 'Bypass Failed :(', time_taken: measured };
      }

      if (candidate.type === 'voltar' && isHostInList(voltarOnlyDomains)) break;

    } catch (err) {
      const measured = formatDuration(apiStart);
      let errorMsg = 'Bypass Failed :(';

      if (err.response) {
        const data = tryParseJson(err.response.data);
        const msg = data?.message || data?.error || data?.result || '';
        if (isUnsupported(msg)) {
          errorMsg = 'Link Not Supported Rip';
        }
      }

      result = { status: 'error', result: errorMsg, time_taken: measured };

      if (candidate.type === 'voltar' && isHostInList(voltarOnlyDomains)) break;
    }
  }

  // Final fallback response
  return res.status(200).json({
    status: result?.status || 'error',
    result: result?.result || 'Bypass Failed :(',
    time_taken: result?.time_taken || formatDuration(handlerStart)
  });
};
