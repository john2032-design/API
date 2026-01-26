const getCurrentTime = () => process.hrtime.bigint();
const formatDuration = (startNs, endNs = process.hrtime.bigint()) => {
  const durationNs = Number(endNs - startNs);
  const durationSec = durationNs / 1_000_000_000;
  return `${durationSec.toFixed(2)}s`;
};

const CONFIG = {
  VOLTAR_BASE: 'https://api.voltar.lol',
  VOLTAR_API_KEY: '3f9c1e10-7f3e-4a67-939b-b42c18e4d7aa',
  MAX_POLL_ATTEMPTS: 80,
  POLL_INTERVAL: 1000,
  POLL_TIMEOUT: 80000,
  SUPPORTED_METHODS: ['GET', 'POST']
};

const sendError = (res, statusCode, message, startTime) => {
  return res.status(statusCode).json({
    status: 'error',
    result: message,
    time_taken: formatDuration(startTime)
  });
};

const sendSuccess = (res, result, userId, startTime) => {
  return res.json({
    status: 'success',
    result,
    x_user_id: userId || '',
    time_taken: formatDuration(startTime)
  });
};

const getUserId = (req) => {
  if (req.method === 'POST') {
    return req.body?.['x_user_id'] || req.body?.['x-user-id'] || req.body?.xUserId || '';
  }
  return req.headers?.['x-user-id'] || req.headers?.['x_user_id'] || req.headers?.['x-userid'] || '';
};

const extractHostname = (url) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    const match = url.match(/https?:\/\/([^\/?#]+)/i);
    return match ? match[1].toLowerCase() : '';
  }
};

const pollTaskResult = async (axios, taskId, headers, startTime, abortController) => {
  let attempts = 0;
  const pollStart = Date.now();
  let currentInterval = CONFIG.POLL_INTERVAL;
  const MAX_BACKOFF = 5000;

  while (attempts < CONFIG.MAX_POLL_ATTEMPTS) {
    if (Date.now() - pollStart > CONFIG.POLL_TIMEOUT) {
      console.error(`Polling timeout reached after ${attempts} attempts`);
      abortController.abort();
      return null;
    }

    try {
      const pollPromise = axios.get(
        `${CONFIG.VOLTAR_BASE}/bypass/getTaskResult/${taskId}`,
        { headers, signal: abortController.signal }
      );

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Poll request timeout')), 10000)
      );

      const resultRes = await Promise.race([pollPromise, timeoutPromise]);

      if (resultRes.data.status === 'success' && resultRes.data.result) {
        return resultRes.data.result;
      } else if (resultRes.data.status === 'failed' || resultRes.data.status === 'error') {
        console.error(`Task permanently failed: ${resultRes.data.message || 'Unknown'}`);
        return null;
      }

      currentInterval = Math.min(currentInterval * 1.5, MAX_BACKOFF);

    } catch (err) {
      if (axios.isCancel(err)) {
        console.error('Polling aborted');
        return null;
      }

      const status = err.response?.status;
      if (status >= 500 || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        currentInterval = Math.min(currentInterval * 2, MAX_BACKOFF);
        if (attempts % 5 === 0) {
          console.error(`Transient poll error (attempt ${attempts}): ${err.message}`);
        }
      } else if (status >= 400 && status < 500) {
        console.error(`Permanent poll error: ${err.message}`);
        return null;
      } else {
        console.error(`Unexpected poll error: ${err.message}`);
      }
    }

    attempts++;

    if (attempts < CONFIG.MAX_POLL_ATTEMPTS) {
      await new Promise(r => setTimeout(r, currentInterval));
    }
  }

  console.error(`Max polling attempts reached: ${CONFIG.MAX_POLL_ATTEMPTS}`);
  return null;
};

const tryVoltar = async (axios, url, incomingUserId, res, handlerStart) => {
  const start = getCurrentTime();
  const abortController = new AbortController();

  const voltarHeaders = {
    'x-user-id': incomingUserId || '',
    'x-api-key': CONFIG.VOLTAR_API_KEY,
    'Content-Type': 'application/json'
  };

  try {
    const createPayload = { url, cache: true };
    if (incomingUserId) createPayload.x_user_id = incomingUserId;

    const createPromise = axios.post(
      `${CONFIG.VOLTAR_BASE}/bypass/createTask`,
      createPayload,
      { headers: voltarHeaders, signal: abortController.signal }
    );

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => {
        abortController.abort();
        reject(new Error('Create task timeout'));
      }, 10000)
    );

    const createRes = await Promise.race([createPromise, timeoutPromise]);

    if (createRes.data.status !== 'success' || !createRes.data.taskId) {
      console.error('Voltar createTask failed or unsupported');
      return { success: false, unsupported: true };
    }

    const taskId = createRes.data.taskId;
    console.log(`Voltar task created: ${taskId}`);

    const pollHeaders = {
      'x-api-key': voltarHeaders['x-api-key'],
      'x-user-id': voltarHeaders['x-user-id']
    };

    const pollingPromise = pollTaskResult(axios, taskId, pollHeaders, start, abortController);
    const overallTimeout = new Promise((_, reject) =>
      setTimeout(() => {
        abortController.abort();
        reject(new Error('Overall polling timeout'));
      }, CONFIG.POLL_TIMEOUT)
    );

    const result = await Promise.race([pollingPromise, overallTimeout]);

    if (result) {
      sendSuccess(res, result, incomingUserId, start);
      return { success: true };
    }

    console.error('Voltar polling failed to get result');
    return { success: false };

  } catch (e) {
    if (axios.isCancel(e)) {
      console.error('Voltar operation aborted due to timeout');
    } else {
      console.error(`Voltar error: ${e.message || String(e)}`);
    }
    if (e.response?.data?.message && /unsupported|invalid|not supported/i.test(e.response.data.message)) {
      return { success: false, unsupported: true };
    }
    return { success: false };
  }
};

const handlePasteTo = async (axios, url, incomingUserId, handlerStart, res) => {
  const start = getCurrentTime();
  
  try {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    
    const key = parsed && parsed.hash ? parsed.hash.slice(1) : (url.split('#')[1] || '');
    
    if (!key) {
      return sendError(res, 400, 'Missing paste key', handlerStart);
    }
    
    const jsonUrl = parsed ? (parsed.hash = '', parsed.toString()) : url.split('#')[0];
    
    const r = await axios.get(jsonUrl, {
      headers: { Accept: 'application/json, text/javascript, */*; q=0.01' }
    });
    
    const data = r.data;
    
    if (!data || !data.ct || !data.adata) {
      return sendError(res, 500, 'Paste data not found', handlerStart);
    }
    
    let lib;
    try {
      lib = await import('privatebin-decrypt');
    } catch {
      lib = require('privatebin-decrypt');
    }
    
    const decryptFn = lib.decryptPrivateBin || lib.default?.decryptPrivateBin || lib.default || lib;
    
    if (typeof decryptFn !== 'function') {
      return sendError(res, 500, 'privatebin-decrypt export not recognized', handlerStart);
    }
    
    let decrypted;
    try {
      decrypted = await decryptFn({ key, data: data.adata, cipherMessage: data.ct });
    } catch (e) {
      return sendError(res, 500, `Decryption failed: ${String(e.message || e)}`, handlerStart);
    }
    
    return sendSuccess(res, decrypted, incomingUserId, start);
    
  } catch (e) {
    console.error('Paste.to handling error: ' + (e.message || String(e)));
    return sendError(res, 500, `Paste.to handling failed: ${String(e.message || e)}`, handlerStart);
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
    
    if (!match) {
      return sendError(res, 500, 'keyText not found', handlerStart);
    }
    
    const keyText = match[1].trim();
    return sendSuccess(res, keyText, incomingUserId, start);
    
  } catch (e) {
    console.error('KeySystem handling error: ' + (e.message || String(e)));
    return sendError(res, 500, `Key fetch failed: ${String(e.message || e)}`, handlerStart);
  }
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-user-id');
};

const sanitizeUrl = (url) => {
  if (typeof url !== 'string') return url;
  return url.trim().replace(/[\r\n\t]/g, '');
};

module.exports = async (req, res) => {
  const handlerStart = getCurrentTime();
  
  console.log(`[${new Date().toISOString()}] ${req.method} request received`);
  
  setCorsHeaders(req, res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
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

  let axios;
  try {
    axios = require('axios');
  } catch {
    console.error('axios module missing');
    return sendError(res, 500, 'axios missing', handlerStart);
  }

  const hostname = extractHostname(url);
  
  if (!hostname) {
    console.error('Invalid URL provided: ' + url);
    return sendError(res, 400, 'Invalid URL', handlerStart);
  }

  console.log('Processing URL with hostname: ' + hostname);

  const incomingUserId = getUserId(req);

  if (hostname === 'paste.to' || hostname.endsWith('.paste.to')) {
    console.log('Handling paste.to URL');
    return await handlePasteTo(axios, url, incomingUserId, handlerStart, res);
  }

  if (hostname === 'get-key.keysystem2352.workers.dev' || hostname === 'get-key.keysystem352.workers.dev') {
    console.log('Handling keysystem URL');
    return await handleKeySystem(axios, url, incomingUserId, handlerStart, res);
  }

  console.log('Attempting Voltar bypass');
  const voltarResult = await tryVoltar(axios, url, incomingUserId, res, handlerStart);
  
  if (voltarResult.success) {
    console.log('Voltar bypass successful');
    return;
  }

  console.error('All bypass methods failed');
  return sendError(res, 500, 'Bypass Failed :(', handlerStart);
};