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
  const easOnly = ['rentry.org','paster.so','loot-link.com','loot-links.com','lootlink.org','lootlinks.co','lootdest.info','lootdest.org','lootdest.com','links-loot.com','linksloot.net','rekonise.com'];
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

  const tryPrivateBinLike = async (inputUrl) => {
    const start = getCurrentTime();
    let sjcl;
    try { sjcl = require('sjcl'); } catch { sjcl = null; }
    let pako;
    try { pako = require('pako'); } catch { pako = null; }
    const base64UrlToBase64 = (s) => {
      s = s.replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      return s;
    };
    const extractIdAndKey = (u) => {
      try {
        const parsed = new URL(u);
        const hash = parsed.hash ? parsed.hash.substring(1) : '';
        const q = parsed.search ? parsed.search.substring(1) : '';
        if (q && /^[0-9a-fA-F]{16,}$/.test(q)) return {id:q,key:hash};
        const qParts = q.split('&');
        for (const part of qParts) {
          if (/^[0-9a-fA-F]{16,}$/.test(part)) return {id:part,key:hash};
          const m = part.match(/^[^=]+=([0-9a-fA-F]{16,})$/);
          if (m) return {id:m[1],key:hash};
        }
        if (hash && /^[A-Za-z0-9\-_]{8,}$/.test(hash)) {
          const pathname = parsed.pathname.replace(/^\/+/,'').replace(/\/$/,'');
          if (pathname) {
            const maybeId = pathname;
            if (/^[0-9a-fA-F]{8,}$/.test(maybeId) || /^[0-9a-fA-F]{16,}$/.test(maybeId)) return {id:maybeId,key:hash};
          }
        }
        const pathMatch = parsed.pathname.match(/[?\/]([0-9a-fA-F]{8,})$/);
        if (pathMatch) return {id:pathMatch[1],key:hash};
        return {id:'',key:hash};
      } catch (e) {
        const m = inputUrl.match(/[?\/]([0-9a-fA-F]{8,16})/);
        const hash = (inputUrl.split('#')[1] || '');
        return {id: m ? m[1] : '', key: hash};
      }
    };
    const {id: pasteId, key: fragmentKey} = extractIdAndKey(inputUrl);
    if (!pasteId) return false;
    let origin;
    try {
      const u = new URL(inputUrl);
      origin = u.origin + (u.pathname && u.pathname !== '/' ? u.pathname : '/');
      if (!origin.endsWith('/')) origin = origin.replace(/\/+$/,'') + '/';
    } catch {
      origin = inputUrl.split('?')[0].split('#')[0];
      if (!origin.endsWith('/')) origin += '/';
    }
    const apiUrl = origin + '?' + pasteId;
    try {
      const r = await axios.get(apiUrl, {headers: {'X-Requested-With': 'JSONHttpRequest', 'Accept': 'application/json, text/json'} , timeout: 10000});
      const d = r.data;
      let cipherdata = null;
      if (!d) return false;
      if (d?.paste?.data) cipherdata = typeof d.paste.data === 'string' ? JSON.parse(d.paste.data) : d.paste.data;
      else if (d?.items && Array.isArray(d.items) && d.items[0]?.data) cipherdata = typeof d.items[0].data === 'string' ? JSON.parse(d.items[0].data) : d.items[0].data;
      else if (d?.data && typeof d.data === 'string') {
        try { cipherdata = JSON.parse(d.data); } catch { cipherdata = d.data; }
      } else if (d?.messages && Array.isArray(d.messages) && d.messages[0]?.data) {
        try { cipherdata = JSON.parse(d.messages[0].data); } catch { cipherdata = d.messages[0].data; }
      } else if (typeof d === 'object' && (d.iv || d.ct || d.salt || d.ct)) cipherdata = d;
      else {
        const html = typeof d === 'string' ? d : JSON.stringify(d);
        const scriptMatch = html.match(/var\s+cipher_data\s*=\s*({[\s\S]*?});/i) || html.match(/data:\s*'({[\s\S]*?})'/i);
        if (scriptMatch) {
          try { cipherdata = JSON.parse(scriptMatch[1]); } catch {}
        }
      }
      if (!cipherdata) return false;
      let plaintext = null;
      const variants = [];
      if (fragmentKey) {
        variants.push(fragmentKey);
        try { variants.push(Buffer.from(base64UrlToBase64(fragmentKey),'base64').toString('utf8')); } catch {}
        try { variants.push(Buffer.from(base64UrlToBase64(fragmentKey),'base64').toString('hex')); } catch {}
        try { variants.push(decodeURIComponent(fragmentKey)); } catch {}
      }
      variants.push(pasteId);
      variants.push('');
      if (sjcl) {
        const cipherJson = typeof cipherdata === 'string' ? cipherdata : JSON.stringify(cipherdata);
        for (const v of variants) {
          try {
            let maybe = null;
            try { maybe = sjcl.decrypt(v || '', cipherJson); } catch {}
            if (!maybe && v) {
              try { maybe = sjcl.decrypt(v + '', cipherJson); } catch {}
            }
            if (!maybe) continue;
            plaintext = maybe;
            break;
          } catch {}
        }
      } else {
        try {
          const r2 = await axios.get(apiUrl, {headers:{'Accept':'text/plain, text/html'} , timeout: 10000});
          const bodyText = typeof r2.data === 'string' ? r2.data : JSON.stringify(r2.data);
          const onlyTxtMatch = bodyText.replace(/\r/g,'').split('\n').map(l => l.trim()).filter(Boolean).slice(0,500).join('\n');
          if (onlyTxtMatch) plaintext = onlyTxtMatch;
        } catch {}
      }
      if (!plaintext) {
        if (cipherdata && typeof cipherdata === 'object' && cipherdata.ct && fragmentKey && sjcl) {
          const cipherJson = JSON.stringify(cipherdata);
          try {
            plaintext = sjcl.decrypt(fragmentKey, cipherJson);
          } catch {}
          if (!plaintext) {
            try {
              plaintext = sjcl.decrypt(Buffer.from(base64UrlToBase64(fragmentKey),'base64').toString('utf8'), cipherJson);
            } catch {}
          }
        }
      }
      if (!plaintext) return false;
      let finalText = plaintext;
      const maybeBase64 = (s) => /^[A-Za-z0-9+\/=\s]+$/.test(s) && s.length > 32;
      if (pako) {
        try {
          const asBase64 = finalText.replace(/\s+/g,'');
          if (maybeBase64(asBase64)) {
            const buf = Buffer.from(asBase64, 'base64');
            try {
              const inflated = pako.inflateRaw(buf);
              finalText = Buffer.from(inflated).toString('utf8');
            } catch (e) {
              try {
                const inflated2 = pako.inflate(buf);
                finalText = Buffer.from(inflated2).toString('utf8');
              } catch {}
            }
          }
        } catch {}
      }
      const lines = finalText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const creds = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const userMatch = l.match(/(?:user(?:name)?|login|account|email)\s*[:=\-]\s*(.+)$/i);
        const passMatch = l.match(/(?:pass(?:word)?|pwd|pw)\s*[:=\-]\s*(.+)$/i);
        if (userMatch) {
          const user = userMatch[1].trim();
          let pass = null;
          const next = lines[i+1];
          if (next) {
            const nm = next.match(/(?:pass(?:word)?|pwd|pw)\s*[:=\-]\s*(.+)$/i);
            if (nm) { pass = nm[1].trim(); i++; }
          }
          creds.push({user,pass});
        } else if (passMatch) {
          const pass = passMatch[1].trim();
          const prev = lines[i-1];
          let user = null;
          if (prev) {
            const um = prev.match(/(?:user(?:name)?|login|account|email)\s*[:=\-]\s*(.+)$/i);
            if (um) user = um[1].trim();
          }
          creds.push({user,pass});
        } else {
          const pair = l.split(/\s+/);
          if (pair.length === 2 && /@|:/.test(pair[0]) === false) {
            const maybeUser = pair[0];
            const maybePass = pair[1];
            if (maybeUser.length <= 64 && maybePass.length <= 64) creds.push({user:maybeUser,pass:maybePass});
          }
        }
      }
      const resultOut = {text: finalText, credentials: creds};
      res.json({status:'success',result:resultOut,time_taken:formatDuration(start)});
      return true;
    } catch (e) {
      return false;
    }
  };

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

  const privateBinResult = await tryPrivateBinLike(url);
  if (privateBinResult === true) return;

  res.json({status:'error',result:'Bypass Failed :(',time_taken:formatDuration(handlerStart)});
};
