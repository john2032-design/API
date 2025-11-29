const getCurrentTime = () => process.hrtime.bigint();

const calculateDuration = (startTime) => {
  const endTime = process.hrtime.bigint();
  const durationNs = Number(endTime - startTime);
  const durationMs = durationNs / 1_000_000;
  const durationSec = durationMs / 1000;
  return `${durationSec.toFixed(3)}s`;
};

const tryParseJson = (maybeJson) => {
  if (!maybeJson) return null;
  if (typeof maybeJson === 'object') return maybeJson;
  try {
    return JSON.parse(maybeJson);
  } catch (e) {
    return null;
  }
};

const normalizeApiResponse = (raw) => {
  if (!raw || typeof raw !== 'object') return null;

  // map common fields from provided examples into a consistent shape
  const status = raw.status ?? (raw.statusCode ? (raw.statusCode >= 200 && raw.statusCode < 300 ? 'success' : 'error') : 'error');
  const action = raw.action ?? 'bypass-url';
  const result = raw.result ?? raw.message ?? raw.error ?? null;
  const made_by = raw.made_by ?? raw.created_by ?? null;
  const website = raw.website ?? raw.source ?? null;

  // Normalize time_taken (examples show "0.685s")
  let time_taken = raw.time_taken ?? raw.time ?? null;
  if (typeof time_taken === 'number') time_taken = `${(time_taken).toFixed(3)}s`;
  if (typeof time_taken === 'string' && /^\d+(\.\d+)?$/.test(time_taken)) {
    time_taken = `${Number(time_taken).toFixed(3)}s`;
  }

  // Keep original raw object for debugging if needed
  return {
    status,
    action,
    result,
    made_by,
    website,
    time_taken,
    raw
  };
};

module.exports = (req, res) => {
  const startTime = getCurrentTime();

  // Try to get any API response passed in (either query or body)
  const incoming = tryParseJson(req.query?.api_response ?? req.body?.api_response ?? null);

  // Your two example API responses (from your message) — used as fallback / examples
  const exampleSuccess = {
    status: "success",
    action: "bypass-url",
    result: "URL_HERE",
    made_by: "emmanuel_50414",
    website: "ace-bypass.com",
    time_taken: "0.685s"
  };

  const exampleError = {
    status: "error",
    action: "bypass-url",
    result: "Bypass service returned an error and the URL will not be bypassed: Request failed with status code 400",
    made_by: "emmanuel_50414",
    website: "ace-bypass.com"
  };

  // Build apis array: if incoming is present, include it first; always include the two examples
  const apisRaw = [];
  if (incoming) apisRaw.push(incoming);
  apisRaw.push(exampleSuccess, exampleError);

  const apis = apisRaw.map(normalizeApiResponse).filter(Boolean);

  // Set top-level status/result to reflect the incoming API response if provided,
  // otherwise give a default 'success' and descriptive result.
  let topStatus = "success";
  let topResult = "API Proxy Service ready";

  if (incoming) {
    const normalized = normalizeApiResponse(incoming);
    if (normalized) {
      topStatus = normalized.status ?? topStatus;
      topResult = normalized.result ?? topResult;
    }
  }

  const time = calculateDuration(startTime);

  // Final JSON response — no rate limits or limits fields are added
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    status: topStatus,
    result: topResult,
    message: "API Proxy Service",
    endpoints: {
      "/bypass?url=YOUR_URL": "Bypass URL shorteners (POST/GET — returns upstream API response)",
      "/supported": "List of supported services"
    },
    apis,                         // formatted array of API responses (includes examples)
    server_time_taken: time       // total handler time, e.g. "0.012s"
  });
};
