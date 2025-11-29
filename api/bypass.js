const axios = require('axios');

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
  // raw may be null / object / string
  const obj = (typeof raw === 'object') ? raw : tryParseJson(raw);
  // Determine status: prefer explicit string 'success', otherwise treat anything else as 'error'
  let status = null;
  if (obj && (typeof obj.status === 'string')) {
    status = obj.status.toLowerCase() === 'success' ? 'success' : 'error';
  } else if (obj && (typeof obj.status === 'number' || typeof obj.statusCode === 'number')) {
    const code = obj.status ?? obj.statusCode;
    status = (code >= 200 && code < 300) ? 'success' : 'error';
  } else {
    // if upstream didn't indicate status, we don't assume success — caller code will set success when appropriate
    status = null;
  }

  // Result: only take explicit result/message/error fields if present, otherwise null
  const result = obj?.result ?? obj?.message ?? obj?.error ?? null;

  // time_taken: use upstream field if provided, otherwise use measuredTime
  let timeTaken = obj?.time_taken ?? obj?.time ?? measuredTime;
  if (typeof timeTaken === 'number') timeTaken = `${Number(timeTaken).toFixed(3)}s`;
  if (typeof timeTaken === 'string' && /^\d+(\.\d+)?$/.test(timeTaken)) {
    timeTaken = `${Number(timeTaken).toFixed(3)}s`;
  }
  // final fallback ensure it's a string
  if (!timeTaken) timeTaken = measuredTime ?? '0.000s';

  return {
    status: status === 'success' ? 'success' : (status === 'error' ? 'error' : null),
    result: result ?? null,
    time_taken: timeTaken
  };
};

module.exports = async (req, res) => {
  const handlerStart = getCurrentTime();

  // CORS & headers
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
      status: 'error',
      result: 'Method not allowed. Use GET.',
      time_taken: formatDuration(handlerStart) // minimal top-level time_taken for consistency
    });
  }

  const url = req.query.url;
  if (!url) {
    return res.status(400).json({
      status: 'error',
      result: 'URL parameter is required',
      time_taken: formatDuration(handlerStart)
    });
  }

  // Configurable upstream endpoints (set via env vars)
  const EAS_API_BASE = process.env.EAS_API_BASE || 'https://eas-bypass.example/api/bypass';
  const EAS_API_KEY = process.env.EAS_API_KEY || 'EAS_API_KEY_PLACEHOLDER';
  const ACE_API_BASE = process.env.ACE_API_BASE || 'https://ace-bypass.com/api/bypass';
  const ACE_API_KEY = process.env.ACE_API_KEY || 'FREE_S7MdXC0momgajOEx1_UKW7FQUvbmzvalu0gTwr-V6cI';

  // Decide order: EAS first for loot URLs, then ACE as fallback
  const shouldUseEas = /(^https?:\/\/)?(www\.)?loot/i.test(url) || url.includes('://loot');
  const candidates = [];
  if (shouldUseEas) {
    candidates.push({
      name: 'EAS',
      url: `${EAS_API_BASE}?url=${encodeURIComponent(url)}&apikey=${encodeURIComponent(EAS_API_KEY)}`
    });
  }
  candidates.push({
    name: 'ACE',
    url: `${ACE_API_BASE}?url=${encodeURIComponent(url)}&apikey=${encodeURIComponent(ACE_API_KEY)}`
  });

  const apis = [];
  let chosen = null; // will hold the minimal normalized object from the first success or last error

  for (const candidate of candidates) {
    const apiStart = getCurrentTime();
    try {
      const response = await axios.get(candidate.url, { timeout: 12_000 });
      const apiEnd = getCurrentTime();
      const measured = formatDuration(apiStart, apiEnd);

      const parsed = tryParseJson(response.data) ?? response.data;
      const minimal = normalizeToMinimal(parsed, measured);

      // If upstream provided no explicit status, infer success from HTTP status
      if (minimal.status === null) {
        minimal.status = (response.status >= 200 && response.status < 300) ? 'success' : 'error';
      }
      // Ensure time_taken is present
      minimal.time_taken = minimal.time_taken ?? measured;

      apis.push(minimal);

      if (minimal.status === 'success') {
        chosen = minimal;
        break; // stop at first success
      } else {
        // keep trying fallback(s); chosen becomes latest error for transparency if no success found
        chosen = minimal;
      }
    } catch (err) {
      const apiEnd = getCurrentTime();
      const measured = formatDuration(apiStart, apiEnd);

      // Build a concise error result (string) and keep only minimal fields
      let errMsg = 'An error occurred';
      if (err.code === 'ECONNREFUSED') errMsg = 'Unable to connect to bypass service';
      else if (err.code === 'ETIMEDOUT') errMsg = 'Request timeout - service unavailable';
      else if (err.response) {
        // try to extract a short message from response body if possible
        const parsed = tryParseJson(err.response.data) ?? err.response.data;
        errMsg = (parsed && (parsed.result || parsed.message || parsed.error)) || `Service error: ${err.response.status}`;
      } else if (err.message) errMsg = err.message;

      const minimal = {
        status: 'error',
        result: errMsg,
        time_taken: measured
      };

      apis.push(minimal);
      chosen = minimal;
      // continue to next candidate
    }
  }

  // If no upstream attempts were recorded (shouldn't happen), return a default error
  if (apis.length === 0) {
    const fallback = {
      status: 'error',
      result: 'No upstream attempts made',
      time_taken: formatDuration(handlerStart)
    };
    return res.status(200).json({
      status: fallback.status,
      result: fallback.result,
      time_taken: fallback.time_taken,
      server_time_taken: formatDuration(handlerStart)
    });
  }

  // Respond using chosen upstream minimal fields as top-level (status/result/time_taken)
  const top = chosen ?? apis[apis.length - 1];
  return res.status(200).json({
    status: top.status || 'error',
    result: top.result ?? null,
    time_taken: top.time_taken ?? formatDuration(handlerStart),
    apis, // array of entries each with exactly {status, result, time_taken}
    server_time_taken: formatDuration(handlerStart)
  });
};
