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
  const EASX_API_URL = 'https://api.eas-x.com/v3/bypass';
  const EASX_API_KEY = '.john2032-3253f-3262k-3631f-2626j-9078k';

  const ACE_API_BASE = process.env.ACE_API_BASE || 'https://ace-bypass.com/api/bypass';
  const ACE_API_KEY = process.env.ACE_API_KEY || 'FREE_S7MdXC0momgajOEx1_UKW7FQUvbmzvalu0gTwr-V6cI';

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
      return url.toLowerCase();
    }
  })();

  const isHostInList = (lists) => lists.some(domain => hostLower === domain || hostLower.endsWith('.' + domain) || hostLower.includes(domain));

  const candidates = [];
  if (isHostInList(easOnlyDomains)) {
    candidates.push({ type: 'easx' });
  } else if (isHostInList(easFirstThenAceDomains)) {
    candidates.push({ type: 'easx' }, { type: 'ace' });
  } else {
    candidates.push({ type: 'ace' });
  }

  let chosen = null;

  for (const candidate of candidates) {
    const apiStart = getCurrentTime();

    if (candidate.type === 'easx') {
      try {
        // EAS-X: POST JSON body, no timeout
        const response = await axios.post(
          EASX_API_URL,
          { url: url },
          {
            headers: {
              'accept': 'application/json',
              'eas-api-key': EASX_API_KEY,
              'Content-Type': 'application/json'
            }
            // intentionally no timeout
          }
        );

        const apiEnd = getCurrentTime();
        const measured = formatDuration(apiStart, apiEnd);

        const parsed = tryParseJson(response.data) ?? response.data;
        const minimal = normalizeToMinimal(parsed, measured);

        if (minimal.status === null) {
          minimal.status = (response.status >= 200 && response.status < 300) ? 'success' : 'error';
        }
        minimal.time_taken = minimal.time_taken ?? measured;

        chosen = minimal;
        if (minimal.status === 'success') break;
        if (isHostInList(easOnlyDomains)) break;
      } catch (err) {
        const apiEnd = getCurrentTime();
        const measured = formatDuration(apiStart, apiEnd);

        let errMsg = 'An error occurred';
        if (err.code === 'ECONNREFUSED') errMsg = 'Unable to connect to eas-x service';
        else if (err.code === 'ETIMEDOUT') errMsg = 'Request timeout - service unavailable';
        else if (err.response) {
          const parsed = tryParseJson(err.response.data) ?? err.response.data;
          errMsg = (parsed && (parsed.result || parsed.message || parsed.error)) || `Service error: ${err.response.status}`;
        } else if (err.message) errMsg = err.message;

        chosen = {
          status: 'error',
          result: errMsg,
          time_taken: measured
        };

        if (isHostInList(easOnlyDomains)) break;
        // otherwise continue to next candidate (ACE)
      }
    } else if (candidate.type === 'ace') {
      try {
        // ACE: GET with query params, no timeout
        const aceUrl = `${ACE_API_BASE}?url=${encodeURIComponent(url)}&apikey=${encodeURIComponent(ACE_API_KEY)}`;
        const response = await axios.get(aceUrl /* no timeout */ );

        const apiEnd = getCurrentTime();
        const measured = formatDuration(apiStart, apiEnd);

        const parsed = tryParseJson(response.data) ?? response.data;
        const minimal = normalizeToMinimal(parsed, measured);

        if (minimal.status === null) {
          minimal.status = (response.status >= 200 && response.status < 300) ? 'success' : 'error';
        }
        minimal.time_taken = minimal.time_taken ?? measured;

        chosen = minimal;
        if (minimal.status === 'success') break;
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

        chosen = {
          status: 'error',
          result: errMsg,
          time_taken: measured
        };
      }
    }
  } // end for candidates

  if (!chosen) {
    return res.status(200).json({
      status: 'error',
      result: 'No upstream attempts made',
      time_taken: formatDuration(handlerStart)
    });
  }

  return res.status(200).json({
    status: chosen.status || 'error',
    result: chosen.result ?? null,
    time_taken: chosen.time_taken ?? formatDuration(handlerStart)
  });
};
