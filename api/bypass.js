const axios = require('axios');

const getCurrentTime = () => process.hrtime.bigint();

const formatDuration = (startNs, endNs = process.hrtime.bigint()) => {
  const durationNs = Number(endNs - startNs);
  const durationMs = durationNs / 1_000_000;
  const durationSec = durationMs / 1000;
  return `${durationSec.toFixed(3)}s`;
};

const tryParseJson = (val) => {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch (e) { return null; }
};

const normalizeApi = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const status = raw.status ?? (raw.statusCode ? (raw.statusCode >= 200 && raw.statusCode < 300 ? 'success' : 'error') : 'error');
  const action = raw.action ?? 'bypass-url';
  const result = raw.result ?? raw.message ?? raw.error ?? null;
  const made_by = raw.made_by ?? raw.created_by ?? null;
  const website = raw.website ?? raw.source ?? null;
  const time_taken = raw.time_taken ?? raw.time ?? null;
  return { status, action, result, made_by, website, time_taken, raw };
};

module.exports = async (req, res) => {
  const handlerStart = getCurrentTime();

  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      status: "error",
      result: "Method not allowed. Use GET.",
      server_time_taken: formatDuration(handlerStart)
    });
  }

  const url = req.query.url;
  if (!url) {
    return res.status(400).json({
      status: "error",
      result: "URL parameter is required",
      server_time_taken: formatDuration(handlerStart)
    });
  }

  // Upstream endpoints and API keys (adjust env vars as needed)
  const EAS_API_BASE = process.env.EAS_API_BASE || 'https://eas-bypass.example/api/bypass';
  const EAS_API_KEY = process.env.EAS_API_KEY || 'EAS_API_KEY_PLACEHOLDER';
  const ACE_API_BASE = process.env.ACE_API_BASE || 'https://ace-bypass.com/api/bypass';
  const ACE_API_KEY = process.env.ACE_API_KEY || 'FREE_S7MdXC0momgajOEx1_UKW7FQUvbmzvalu0gTwr-V6cI';

  // Build candidate upstream calls in order (EAS first if URL contains 'loot')
  const shouldUseEas = /(^https?:\/\/)?(www\.)?loot/i.test(url) || url.includes('://loot');
  const candidates = [];

  if (shouldUseEas) {
    candidates.push({
      name: 'EAS',
      url: `${EAS_API_BASE}?url=${encodeURIComponent(url)}&apikey=${encodeURIComponent(EAS_API_KEY)}`
    });
  }
  // always include ace-bypass as fallback
  candidates.push({
    name: 'ACE',
    url: `${ACE_API_BASE}?url=${encodeURIComponent(url)}&apikey=${encodeURIComponent(ACE_API_KEY)}`
  });

  const apis = [];

  // Try each candidate in order until one returns a success-like response
  let topStatus = 'success';
  let topResult = 'API Proxy Service';
  let upstreamUsed = null;

  for (const candidate of candidates) {
    const apiStart = getCurrentTime();
    let apiResp = { name: candidate.name, requested_url: candidate.url, error: null, duration: null, raw: null };

    try {
      const response = await axios.get(candidate.url, { timeout: 12_000 });
      apiResp.duration = formatDuration(apiStart);
      apiResp.raw = tryParseJson(response.data) ?? response.data;

      // Normalize and push
      const normalized = normalizeApi(apiResp.raw) ?? {
        status: response.status >= 200 && response.status < 300 ? 'success' : 'error',
        action: 'bypass-url',
        result: apiResp.raw ?? response.data,
        made_by: null,
        website: candidate.name.toLowerCase(),
        time_taken: apiResp.duration,
        raw: apiResp.raw ?? response.data
      };
      // ensure time_taken
      normalized.time_taken = normalized.time_taken ?? apiResp.duration;

      apis.push({ provider: candidate.name, ok: true, normalized });

      // If upstream returned a 'success' status field, use it as top-level; if it's 'error' continue to fallback
      const upstreamStatus = (normalized.status || '').toLowerCase();
      if (upstreamStatus === 'success') {
        topStatus = normalized.status;
        topResult = normalized.result ?? 'Bypass succeeded';
        upstreamUsed = candidate.name;
        break; // success — stop trying more candidates
      } else {
        // keep the error normalized info but try fallback
        apis[apis.length - 1].ok = false;
        apis[apis.length - 1].error_note = 'Upstream reported error status';
        // set topStatus/result to the most recent upstream error for transparency
        topStatus = normalized.status || 'error';
        topResult = normalized.result || normalized.raw || `Upstream ${candidate.name} returned an error`;
        // continue to next candidate
      }
    } catch (err) {
      const end = getCurrentTime();
      apiResp.duration = formatDuration(apiStart, end);

      // Build error description
      let errMsg = 'Unknown error';
      if (err.code === 'ECONNREFUSED') errMsg = 'Unable to connect to bypass service';
      else if (err.code === 'ETIMEDOUT') errMsg = 'Request timeout - service unavailable';
      else if (err.response) errMsg = `Service error: ${err.response.status}`;
      else if (err.message) errMsg = err.message;

      apiResp.error = errMsg;
      apis.push({
        provider: candidate.name,
        ok: false,
        normalized: {
          status: 'error',
          action: 'bypass-url',
          result: `Bypass service returned an error: ${errMsg}`,
          made_by: null,
          website: candidate.name.toLowerCase(),
          time_taken: apiResp.duration,
          raw: err.response ? tryParseJson(err.response.data) ?? err.response.data : null
        }
      });

      // set top-level to this error but continue to next candidate
      topStatus = 'error';
      topResult = `Bypass service returned an error: ${errMsg}`;
      // continue trying fallback(s)
    }
  } // end for candidates

  // final handler time
  const serverTime = formatDuration(handlerStart);

  // If none succeeded, topStatus/topResult reflect the last upstream attempt error
  const code = topStatus && topStatus.toLowerCase() === 'success' ? 200 : 200; // keep 200 so client receives payload (your previous behavior used 200 on upstream error examples)
  return res.status(code).json({
    status: topStatus,
    result: topResult,
    message: "API Proxy Service",
    upstream_used: upstreamUsed ?? null,
    apis, // array of attempted upstream responses (normalized)
    server_time_taken: serverTime
  });
};
