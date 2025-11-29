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
  const obj = (typeof raw === 'object') ? raw : tryParseJson(raw);
  // status detection
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
      time_taken: formatDuration(handlerStart)
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

  // === Config ===
  // EAS-X (new API) - POST with JSON body, no timeout
  const EASX_API_URL = 'https://api.eas-x.com/v3/bypass';
  const EASX_API_KEY = '.john2032-3253f-3262k-3631f-2626j-9078k';

  // ACE (fallback / default) - GET with query param, keep timeout for ACE
  const ACE_API_BASE = process.env.ACE_API_BASE || 'https://ace-bypass.com/api/bypass';
  const ACE_API_KEY = process.env.ACE_API_KEY || 'FREE_S7MdXC0momgajOEx1_UKW7FQUvbmzvalu0gTwr-V6cI';
  const ACE_TIMEOUT_MS = 12_000;

  // Domain rules
  const easOnlyDomains = [
    "rentry.org","paster.so","loot-link.com","loot-links.com","lootlink.org",
    "lootlinks.co","lootdest.info","lootdest.org","lootdest.com","links-loot.com","linksloot.net"
  ].map(d => d.toLowerCase());

  const easFirstThenAceDomains = [
    "linkvertise.com","link-target.net","link-center.net","link-to.net"
  ].map(d => d.toLowerCase());

  const hostLower = (() => {
    try {
      const u = new URL(url);
      return (u.hostname || '').toLowerCase();
    } catch (e) {
      // If URL parsing fails, fallback to using the raw url string lowercased
      return url.toLowerCase();
    }
  })();

  const isHostInList = (lists) => lists.some(domain => hostLower === domain || hostLower.endsWith('.' + domain) || hostLower.includes(domain));

  // Build candidate behavior based on domain rules
  // Candidates are objects like { type: 'easx' } or { type: 'ace' }
  const candidates = [];

  if (isHostInList(easOnlyDomains)) {
    // Only use eas-x (no fallback)
    candidates.push({ type: 'easx' });
  } else if (isHostInList(easFirstThenAceDomains)) {
    // Try eas-x first, then ACE fallback
    candidates.push({ type: 'easx' }, { type: 'ace' });
  } else {
    // Default: use ACE only
    candidates.push({ type: 'ace' });
  }

  const apis = [];
  let chosen = null;

  for (const candidate of candidates) {
    const apiStart = getCurrentTime();

    if (candidate.type === 'easx') {
      // POST json body, no timeout, required headers exactly as specified
      try {
        const response = await axios.post(
          EASX_API_URL,
          { url: url },
          {
            headers: {
              'accept': 'application/json',
              'eas-api-key': EASX_API_KEY,
              'Content-Type': 'application/json'
            }
            // intentionally no timeout here (per your instruction)
          }
        );
        const apiEnd = getCurrentTime();
        const measured = formatDuration(apiStart, apiEnd);

        const parsed = tryParseJson(response.data) ?? response.data;
        const minimal = normalizeToMinimal(parsed, measured);

        // If upstream provided no explicit status, infer from HTTP status
        if (minimal.status === null) {
          minimal.status = (response.status >= 200 && response.status < 300) ? 'success' : 'error';
        }
        minimal.time_taken = minimal.time_taken ?? measured;

        apis.push(minimal);
        if (minimal.status === 'success') {
          chosen = minimal;
          break; // stop at first success
        } else {
          // If domain was easOnlyDomains, do not fallback — return this error
          if (isHostInList(easOnlyDomains)) {
            chosen = minimal;
            break;
          }
          // otherwise continue to next candidate (e.g., ACE)
          chosen = minimal;
        }
      } catch (err) {
        const apiEnd = getCurrentTime();
        const measured = formatDuration(apiStart, apiEnd);

        // concise error message
        let errMsg = 'An error occurred';
        if (err.code === 'ECONNREFUSED') errMsg = 'Unable to connect to eas-x service';
        else if (err.code === 'ETIMEDOUT') errMsg = 'Request timeout - service unavailable';
        else if (err.response) {
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

        // If this host is in easOnlyDomains, do not continue to fallback; break
        if (isHostInList(easOnlyDomains)) break;
        // else continue to next candidate (ACE)
      }
    } else if (candidate.type === 'ace') {
      // ACE: GET with query params, keep timeout
      try {
        const aceUrl = `${ACE_API_BASE}?url=${encodeURIComponent(url)}&apikey=${encodeURIComponent(ACE_API_KEY)}`;
        const response = await axios.get(aceUrl, { timeout: ACE_TIMEOUT_MS });
        const apiEnd = getCurrentTime();
        const measured = formatDuration(apiStart, apiEnd);

        const parsed = tryParseJson(response.data) ?? response.data;
        const minimal = normalizeToMinimal(parsed, measured);

        if (minimal.status === null) {
          minimal.status = (response.status >= 200 && response.status < 300) ? 'success' : 'error';
        }
        minimal.time_taken = minimal.time_taken ?? measured;

        apis.push(minimal);
        if (minimal.status === 'success') {
          chosen = minimal;
          break;
        } else {
          chosen = minimal;
          // continue if there were more candidates (unlikely for ACE)
        }
      } catch (err) {
        const apiEnd = getCurrentTime();
        const measured = formatDuration(apiStart, apiEnd);

        let errMsg = 'An error occurred';
        if (err.code === 'ECONNREFUSED') errMsg = 'Unable to connect to ACE bypass service';
        else if (err.code === 'ETIMEDOUT') errMsg = 'Request timeout - ACE service unavailable';
        else if (err.response) {
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
        // continue to next candidate if any
      }
    }
  } // end for candidates

  // If nothing recorded, fallback minimal error
  if (apis.length === 0) {
    const fallback = {
      status: 'error',
      result: 'No upstream attempts made',
      time_taken: formatDuration(handlerStart)
    };
    return res.status(200).json({
      status: fallback.status,
      result: fallback.result,
      time_taken: fallback.time_taken
    });
  }

  // Top-level fields must be exactly {status, result, time_taken} from chosen (success or last error)
  const top = chosen ?? apis[apis.length - 1];

  // Respond (HTTP 200 to match your previous behavior)
  return res.status(200).json({
    status: top.status || 'error',
    result: top.result ?? null,
    time_taken: top.time_taken ?? formatDuration(handlerStart),
    apis // each entry is exactly {status, result, time_taken}
  });
};
