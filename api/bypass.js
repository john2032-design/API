const getCurrentTime = () => process.hrtime.bigint();
const formatDuration = (startNs, endNs = process.hrtime.bigint()) => {
  const durationNs = Number(endNs - startNs);
  const durationSec = durationNs / 1_000_000_000;
  return `${durationSec.toFixed(2)}s`;
};

module.exports = async (req, res) => {
  const handlerStart = getCurrentTime();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ status: 'error', result: 'Method not allowed', time_taken: formatDuration(handlerStart) });
  }

  const url = req.method === 'GET' ? req.query.url : req.body?.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ status: 'error', result: 'Missing url parameter', time_taken: formatDuration(handlerStart) });
  }

  let axios;
  try { axios = require('axios'); } catch {
    return res.status(500).json({ status: 'error', result: 'axios missing', time_taken: formatDuration(handlerStart) });
  }

  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    const m = url.match(/https?:\/\/([^\/?#]+)/i);
    hostname = m ? m[1].toLowerCase() : '';
  }
  if (!hostname) {
    return res.status(400).json({ status: 'error', result: 'Invalid URL', time_taken: formatDuration(handlerStart) });
  }

  const voltarOnly = ['key.valex.io','auth.plato','work.ink','link4m.com','keyrblx.com','link4sub.com','linkify.ru','sub4unlock.io','sub2unlock','sub2get.com','sub2unlock.net'];
  const easOnly = ['rentry.org','paster.so','loot-link.com','loot-links.com','lootlink.org','lootlinks.co','lootdest.info','lootdest.org','lootdest.com','links-loot.com','linksloot.net','rekonise.com'];

  const isVoltarOnly = voltarOnly.some(d => hostname === d || hostname.endsWith('.' + d));
  const isEasOnly = easOnly.some(d => hostname === d || hostname.endsWith('.' + d));

  const voltarBase = 'http://77.110.121.76:3000';
  const voltarHeaders = {
    'x-user-id': '',
    'x-api-key': '3f9c1e10-7f3e-4a67-939b-b42c18e4d7aa',
    'Content-Type': 'application/json'
  };

  const easConfig = {
    method: 'POST',
    url: 'https://api.eas-x.com/v3/bypass',
    headers: {
      'accept': 'application/json',
      'eas-api-key': process.env.EASX_API_KEY || '.john2032-3253f-3262k-3631f-2626j-9078k',
      'Content-Type': 'application/json'
    },
    data: { url }
  };

  const aceConfig = {
    method: 'GET',
    url: `https://ace-bypass.com/api/bypass?url=${encodeURIComponent(url)}&apikey=${process.env.ACE_API_KEY || 'FREE_S7MdXC0momgajOEx1_UKW7FQUvbmzvalu0gTwr-V6cI'}`
  };

  const tryVoltar = async () => {
    const start = getCurrentTime();
    try {
      const createRes = await axios.post(`${voltarBase}/bypass/createTask`, { url, cache: true }, { headers: voltarHeaders });
      if (createRes.data.status !== 'success' || !createRes.data.taskId) return 'unsupported';
      const taskId = createRes.data.taskId;
      for (let i = 0; i < 140; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const resultRes = await axios.get(`${voltarBase}/bypass/getTaskResult/${taskId}`, { headers: { 'x-api-key': voltarHeaders['x-api-key'] } });
          if (resultRes.data.status === 'success' && resultRes.data.result) {
            res.json({ status: 'success', result: resultRes.data.result, time_taken: formatDuration(start) });
            return true;
          }
        } catch {}
      }
      return false;
    } catch (e) {
      if (e.response?.data?.message && /unsupported|invalid|not supported/i.test(e.response.data.message)) return 'unsupported';
      return false;
    }
  };

  const tryApi = async (config) => {
    const start = getCurrentTime();
    try {
      const r = await axios(config);
      const d = r.data;
      const link = d?.result || d?.destination || d?.url || d?.link || d?.data;
      if (link) {
        res.json({ status: 'success', result: link, time_taken: formatDuration(start) });
        return true;
      }
      if (/unsupported|not supported|missing_url/i.test(String(d?.message || d?.error || d?.result || ''))) return 'unsupported';
    } catch (e) {
      if (e.response?.data) {
        const msg = e.response.data?.message || e.response.data?.error || e.response.data?.result || '';
        if (/unsupported|not supported|missing_url/i.test(String(msg))) return 'unsupported';
      }
    }
    return false;
  };

  if (hostname === 'paste.to' || hostname.endsWith('.paste.to')) {
    const start = getCurrentTime();
    try {
      let parsed;
      try { parsed = new URL(url); } catch { parsed = null; }
      const key = parsed && parsed.hash ? parsed.hash.slice(1) : (url.split('#')[1] || '');
      if (!key) return res.status(400).json({ status: 'error', result: 'Missing paste key', time_taken: formatDuration(handlerStart) });
      const jsonUrl = parsed ? (parsed.hash = '', parsed.toString()) : url.split('#')[0];
      const r = await axios.get(jsonUrl, { headers: { Accept: 'application/json, text/javascript, */*; q=0.01' } });
      const data = r.data;
      if (!data || !data.ct || !data.adata) return res.status(500).json({ status: 'error', result: 'Paste data not found', time_taken: formatDuration(handlerStart) });
      let lib;
      try { lib = await import('privatebin-decrypt'); } catch { lib = require('privatebin-decrypt'); }
      const decryptFn = lib.decryptPrivateBin || lib.default?.decryptPrivateBin || lib.default || lib;
      if (typeof decryptFn !== 'function') return res.status(500).json({ status: 'error', result: 'privatebin-decrypt export not recognized', time_taken: formatDuration(handlerStart) });
      let decrypted;
      try { decrypted = await decryptFn({ key, data: data.adata, cipherMessage: data.ct }); } catch (e) {
        return res.status(500).json({ status: 'error', result: `Decryption failed: ${String(e.message || e)}`, time_taken: formatDuration(handlerStart) });
      }
      return res.json({ status: 'success', result: decrypted, time_taken: formatDuration(start) });
    } catch (e) {
      return res.status(500).json({ status: 'error', result: `Paste.to handling failed: ${String(e.message || e)}`, time_taken: formatDuration(handlerStart) });
    }
  }

  if (
    hostname === 'get-key.keysystem2352.workers.dev' ||
    hostname === 'get-key.keysystem352.workers.dev'
  ) {
    const start = getCurrentTime();
    try {
      const r = await axios.get(url, { headers: { Accept: 'text/html,*/*' } });
      const body = String(r.data || '');
      const m = body.match(/id=["']keyText["'][^>]*>\s*([\s\S]*?)\s*<\/div>/i);
      if (!m) {
        return res.status(500).json({ status: 'error', result: 'keyText not found', time_taken: formatDuration(handlerStart) });
      }
      const keyText = m[1].trim();
      return res.json({ status: 'success', result: keyText, time_taken: formatDuration(start) });
    } catch (e) {
      return res.status(500).json({ status: 'error', result: `Key fetch failed: ${String(e.message || e)}`, time_taken: formatDuration(handlerStart) });
    }
  }

  if (isVoltarOnly || hostname === 'work.ink' || hostname.endsWith('.work.ink')) {
    const r = await tryVoltar();
    if (r === true) return;
    return res.json({ status: 'error', result: 'Bypass Failed :(', time_taken: formatDuration(handlerStart) });
  }

  if (isEasOnly) {
    const r = await tryApi(easConfig);
    if (r === true) return;
    return res.json({ status: 'error', result: 'Bypass Failed :(', time_taken: formatDuration(handlerStart) });
  }

  const voltarFirst = await tryVoltar();
  if (voltarFirst === true) return;

  const aceResult = await tryApi(aceConfig);
  if (aceResult === true) return;

  const easResult = await tryApi(easConfig);
  if (easResult === true) return;

  res.json({ status: 'error', result: 'Bypass Failed :(', time_taken: formatDuration(handlerStart) });
};
