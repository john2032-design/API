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
    return res.status(405).json({status:'error',result:'Method not allowed',time_taken:formatDuration(handlerStart)});
  }
  const url = req.method === 'GET' ? req.query.url : req.body?.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({status:'error',result:'Missing url parameter',time_taken:formatDuration(handlerStart)});
  }
  let axios;
  try { axios = require('axios'); } catch {
    return res.status(500).json({status:'error',result:'axios missing',time_taken:formatDuration(handlerStart)});
  }
  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    const m = url.match(/https?:\/\/([^\/?#]+)/i);
    hostname = m ? m[1].toLowerCase() : '';
  }
  if (!hostname) {
    return res.status(400).json({status:'error',result:'Invalid URL',time_taken:formatDuration(handlerStart)});
  }
  const voltarOnly = ['key.valex.io','auth.plato','work.ink','link4m.com','keyrblx.com','link4sub.com','linkify.ru','sub4unlock.io','sub2unlock','sub2get.com','sub2unlock.net'];
  const easOnly = ['rentry.org','paster.so','loot-link.com','loot-links.com','lootlink.org','lootlinks.co','lootdest.info','lootdest.org','lootdest.com','links-loot.com','linksloot.net'];
  const isVoltarOnly = voltarOnly.some(d => hostname === d || hostname.endsWith('.'+d));
  const isEasOnly = easOnly.some(d => hostname === d || hostname.endsWith('.'+d));
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
      'accept':'application/json',
      'eas-api-key': process.env.EASX_API_KEY || '.john2032-3253f-3262k-3631f-2626j-9078k',
      'Content-Type':'application/json'
    },
    data: {url}
  };
  const aceConfig = {
    method: 'GET',
    url: `https://ace-bypass.com/api/bypass?url=${encodeURIComponent(url)}&apikey=${process.env.ACE_API_KEY || 'FREE_S7MdXC0momgajOEx1_UKW7FQUvbmzvalu0gTwr-V6cI'}`
  };
  const tryVoltar = async () => {
    const start = getCurrentTime();
    try {
      const createRes = await axios.post(`${voltarBase}/bypass/createTask`,{url,cache:true},{headers:voltarHeaders});
      if (createRes.data.status !== 'success' || !createRes.data.taskId) return 'unsupported';
      const taskId = createRes.data.taskId;
      for (let i = 0; i < 140; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const resultRes = await axios.get(`${voltarBase}/bypass/getTaskResult/${taskId}`,{headers:{'x-api-key':voltarHeaders['x-api-key']}});
          if (resultRes.data.status === 'success' && resultRes.data.result) {
            res.json({status:'success',result:resultRes.data.result,time_taken:formatDuration(start)});
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
        res.json({status:'success',result:link,time_taken:formatDuration(start)});
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
    let decryptor;
    try { decryptor = require('privatebin-decrypt'); } catch {
      return res.status(500).json({status:'error',result:'privatebin-decrypt missing',time_taken:formatDuration(handlerStart)});
    }
    let pasteId = '';
    let key = '';
    try {
      const u = new URL(url);
      pasteId = u.search ? u.search.slice(1).split('&')[0] : (u.pathname ? u.pathname.replace(/^\/+/,'').split('/')[0] : '');
      key = u.hash ? u.hash.slice(1) : '';
    } catch {
      const m = url.match(/^[^#]*\?([^#]+)/);
      pasteId = m ? m[1].split('&')[0] : '';
      const h = url.split('#')[1];
      key = h || '';
    }
    if (!pasteId) return res.status(400).json({status:'error',result:'Paste ID missing',time_taken:formatDuration(start)});
    if (!key) return res.status(400).json({status:'error',result:'Decryption key missing in URL fragment',time_taken:formatDuration(start)});
    try {
      const resp = await axios.get(`https://paste.to/?${pasteId}`, { headers: { 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'JSONHttpRequest' }, timeout:15000 });
      const body = resp.data;
      let ct, adata;
      if (body && typeof body === 'object' && body.ct && body.adata) {
        ct = body.ct;
        adata = body.adata;
      } else if (body && Array.isArray(body.messages) && body.messages.length) {
        const m0 = body.messages[0];
        ct = m0.ct || (m0.data && m0.data.ct) || '';
        adata = m0.adata || (m0.data && m0.data.adata) || m0.data || body.adata || body.messages[0].data;
      } else if (body && body.messages && body.messages[0] && body.messages[0].ct) {
        ct = body.messages[0].ct;
        adata = body.messages[0].adata;
      } else if (body && body.messages && body.messages[0] && body.messages[0].data) {
        const d0 = body.messages[0].data;
        ct = d0.ct || '';
        adata = d0.adata || d0;
      } else {
        return res.status(500).json({status:'error',result:'Unexpected paste format',time_taken:formatDuration(start)});
      }
      if (!ct) return res.status(500).json({status:'error',result:'Ciphertext not found',time_taken:formatDuration(start)});
      const decryptFn = decryptor.decryptPrivateBin || decryptor.default && decryptor.default.decryptPrivateBin ? (decryptor.decryptPrivateBin || decryptor.default.decryptPrivateBin) : (decryptor.default || decryptor);
      const decrypted = await decryptFn({ key, data: adata, cipherMessage: ct });
      return res.json({status:'success',result:decrypted,time_taken:formatDuration(start)});
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      return res.status(500).json({status:'error',result:`PrivateBin decrypt failed: ${msg}`,time_taken:formatDuration(start)});
    }
  }
  if (isVoltarOnly || hostname === 'work.ink' || hostname.endsWith('.work.ink')) {
    const r = await tryVoltar();
    if (r === true) return;
    return res.json({status:'error',result:'Bypass Failed :(',time_taken:formatDuration(handlerStart)});
  }
  if (isEasOnly) {
    const r = await tryApi(easConfig);
    if (r === true) return;
    return res.json({status:'error',result:'Bypass Failed :(',time_taken:formatDuration(handlerStart)});
  }
  const voltarFirst = await tryVoltar();
  if (voltarFirst === true) return;
  const aceResult = await tryApi(aceConfig);
  if (aceResult === true) return;
  const easResult = await tryApi(easConfig);
  if (easResult === true) return;
  res.json({status:'error',result:'Bypass Failed :(',time_taken:formatDuration(handlerStart)});
};
