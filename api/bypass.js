// /api/bypass.js
const getCurrentTime = () => process.hrtime.bigint();
const formatDuration = (startNs, endNs = process.hrtime.bigint()) => {
  const durationNs = Number(endNs - startNs);
  const durationMs = durationNs / 1_000_000;
  const durationSec = durationMs / 1000;
  return `${durationSec.toFixed(3)}s`;
};

const tryParseJson = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return null; }
};

const normalizeToMinimal = (raw, measuredTime) => {
  const obj = (typeof raw === 'object') ? raw : tryParseJson(raw);
  let status = null;
  if (obj && typeof obj.status === 'string') {
    status = obj.status.toLowerCase() === 'success' ? 'success' : 'error';
  } else if (obj && (typeof obj.status === 'number' || typeof obj.statusCode === 'number')) {
    const code = obj.status ?? obj.statusCode;
    status = (code >= 200 && code < 300) ? 'success' : 'error';
  } else {
    status = null;
  }
  const result = obj?.result ?? obj?.message ?? obj?.error ?? null;
  let timeTaken = obj?.time_taken ?? obj?.time ?? measuredTime;
  if (typeof timeTaken === 'number') timeTaken = `${Number(timeTaken).toFixed(3)}s`;
  if (typeof timeTaken === 'string' && /^\d+(\.\d+)?$/.test(timeTaken)) {
    timeTaken = `${Number(timeTaken).toFixed(3)}s`;
  }
  if (!timeTaken) timeTaken = measuredTime ?? '0.000s';
  return {
    status: status === 'success' ? 'success' : (status === 'error' ? 'error' : null),
    result: result ?? null,
    time_taken: timeTaken
  };
};

module.exports = async (req, res) => {
  const handlerStart = getCurrentTime();

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

  let axios;
  try {
    axios = require('axios');
  } catch (e) {
    return res.status(500).json({
      status: 'error',
      result: 'Missing dependency: axios. Run `npm install axios` and redeploy.',
      time_taken: formatDuration(handlerStart)
    });
  }

  // === API CONFIGURATION ===
  const EASX_API_URL = 'https://api.eas-x.com/v3/bypass';
  const EASX_API_KEY = process.env.EASX_API_KEY || '.john2032-3253f-3262k-3631f-2626j-9078k';

  const ACE_API_BASE = process.env.ACE_API_BASE || 'https://ace-bypass.com/api/bypass';
  const ACE_API_KEY = process.env.ACE_API_KEY || 'FREE_S7MdXC0momgajOEx1_UKW7FQUvbmzvalu0gTwr-V6cI';

  const VOLTAR_API_URL = 'http://77.110.121.76:3000/bypass';
  const VOLTAR_API_KEY = '3f9c1e10-7f3e-4a67-939b-b42c18e4d7aa';

  // === DOMAIN LISTS ===
  const voltarOnlyDomains = [
    'key.valex.io',
    'auth.platoboost',
    'work.ink',
    'link4m.com',
    'keyrblx.com',
    'link4sub.com',
    'linkify.ru',
    'sub4unlock.io',
    'sub2unlock'
  ].map(d => d.toLowerCase());

  const easOnlyDomains = [
    'rentry.org', 'paster.so', 'loot-link.com', 'loot-links.com', 'lootlink.org',
    'lootlinks.co', 'lootdest.info', 'lootdest.org', 'lootdest.com', 'links-loot.com', 'linksloot.net'
  ].map(d => d.toLowerCase());

  const linkvertiseAndSimilar = [
    'linkvertise.com', 'link-target.net', 'link-center.net', 'link-to.net'
  ].map(d => d.toLowerCase());

  // === Extract hostname ===
  let hostname = '';
  try {
    const u = new URL(url);
    hostname = u.hostname.toLowerCase();
  } catch (e) {
    hostname = url.toLowerCase().split('/')[2] || '';
  }

  const isHostInList = (list) => list.some(domain => hostname === domain || hostname.endsWith('.' + domain));

  // === Determine API candidate order ===
  let candidates = [];

  if (isHostInList(voltarOnlyDomains)) {
    candidates = [{ type: 'voltar' }];
  } else if (isHostInList(easOnlyDomains)) {
    candidates = [{ type: 'easx' }];
  } else if (isHostInList(linkvertiseAndSimilar)) {
    candidates = [{ type: 'voltar' }, { type: 'easx' }, { type: 'ace' }];
  } else {
    // Default: Try Voltar first (highest success), then ACE, then EAS-X
    candidates = [{ type: 'voltar' }, { type: 'ace' }, { type: 'easx' }];
  }

  let chosen = null;

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
          // No timeout
        });
      } else if (candidate.type === 'easx') {
        response = await axios.post(EASX_API_URL, { url }, {
          headers: {
            'accept': 'application/json',
            'eas-api-key': EASX_API_KEY,
            'Content-Type': 'application/json'
          }
          // No timeout
        });
      } else { // ace
        const aceUrl = `${ACE_API_BASE}?url=${encodeURIComponent(url)}&apikey=${encodeURIComponent(ACE_API_KEY)}`;
        response = await axios.get(aceUrl); // No timeout
      }

      const measured = formatDuration(apiStart);
      const data = response.data;
      const parsed = tryParseJson(data) ?? data;
      const minimal = normalizeToMinimal(parsed, measured);

      if (minimal.status === null) {
        minimal.status = (response.status >= 200 && response.status < 300) ? 'success' : 'error';
      }
      minimal.time_taken = minimal.time_taken ?? measured;

      chosen = minimal;
      if (minimal.status === 'success') break;

    } catch (err) {
      const measured = formatDuration(apiStart);
      let errMsg = 'Unknown error';

      if (err.code === 'ECONNREFUSED') errMsg = 'Service refused connection';
      else if (err.code === 'ENOTFOUND') errMsg = 'Service not found';
      else if (err.response) {
        const data = tryParseJson(err.response.data) ?? err.response.data;
        errMsg = data?.message || data?.error || data?.result || `HTTP ${err.response.status}`;
      } else if (err.message) {
        errMsg = err.message;
      }

      chosen = {
        status: 'error',
        result: `${candidate.type.toUpperCase()}: ${errMsg}`,
        time_taken: measured
      };

      // Do NOT fallback if it's a Voltar-only domain
      if (candidate.type === 'voltar' && isHostInList(voltarOnlyDomains)) {
        break;
      }
    }
  }

  // Final fallback if nothing worked
  if (!chosen) {
    return res.status(200).json({
      status: 'error',
      result: 'All bypass services failed',
      time_taken: formatDuration(handlerStart)
    });
  }

  return res.status(200).json({
    status: chosen.status || 'error',
    result: chosen.result ?? null,
    time_taken: chosen.time_taken ?? formatDuration(handlerStart)
  });
};
