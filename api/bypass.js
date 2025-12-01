const getCurrentTime = () => process.hrtime.bigint();

const formatDuration = (startNs, endNs = process.hrtime.bigint()) => {
  const durationNs = Number(endNs - startNs);
  const durationMs = durationNs / 1_000_000;
  const durationSec = durationMs / 1000;
  return `${durationSec.toFixed(2)}s`;
};

const tryParseJson = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
};

const isUnsupported = (msg) => {
  if (!msg) return false;
  return /unsupported|not supported|not support/i.test(String(msg).toLowerCase());
};

module.exports = async (req, res) => {
  const handlerStart = getCurrentTime();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({
      status: 'error',
      result: 'Method not allowed. Use GET or POST.',
      time_taken: formatDuration(handlerStart)
    });
  }

  const url = req.method === 'GET' ? req.query.url : req.body?.url;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      status: 'error',
      result: 'Missing or invalid url parameter',
      time_taken: formatDuration(handlerStart)
    });
  }

  let axios;
  try {
    axios = require('axios');
  } catch {
    return res.status(500).json({
      status: 'error',
      result: 'Server error: axios not installed',
      time_taken: formatDuration(handlerStart)
    });
  }

  const configs = {
    voltar: {
      url: 'http://77.110.121.76:3000/bypass',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': '3f9c1e10-7f3e-4a67-939b-b42c18e4d7aa'
      },
      body: { url }
    },
    easx: {
      url: 'https://api.eas-x.com/v3/bypass',
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'eas-api-key': process.env.EASX_API_KEY || '.john2032-3253f-3262k-3631f-2626j-9078k',
        'Content-Type': 'application/json'
      },
      body: { url }
    },
    ace: {
      url: `https://ace-bypass.com/api/bypass?url=${encodeURIComponent(url)}&apikey=${process.env.ACE_API_KEY || 'FREE_S7MdXC0momgajOEx1_UKW7FQUvbmzvalu0gTwr-V6cI'}`,
      method: 'GET'
    }
  };

  const voltarOnly = ['key.valex.io','auth.platoboost','work.ink','link4m.com','keyrblx.com','link4sub.com','linkify.ru','sub4unlock.io','sub2unlock'];
  const easOnly = ['rentry.org','paster.so','loot-link.com','loot-links.com','lootlink.org','lootlinks.co','lootdest.info','lootdest.org','lootdest.com','links-loot.com','linksloot.net'];
  const linkvertise = ['linkvertise.com','link-target.net','link-center.net','link-to.net'];

  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    const m = url.match(/https?:\/\/([^\/?#]+)/i);
    hostname = m ? m[1].toLowerCase() : '';
  }

  const hasDomain = (list) => list.some(d => hostname === d || hostname.endsWith('.' + d));

  let apiOrder = [];
  if (hasDomain(voltarOnly)) apiOrder = ['voltar'];
  else if (hasDomain(easOnly)) apiOrder = ['easx'];
  else if (hasDomain(linkvertise)) apiOrder = ['voltar','easx','ace'];
  else apiOrder = ['voltar','ace','easx'];

  for (const apiName of apiOrder) {
    const apiStart = getCurrentTime();
    const config = configs[apiName];

    try {
      let response;
      if (config.method === 'POST') {
        response = await axios.post(config.url, config.body, { headers: config.headers });
      } else {
        response = await axios.get(config.url);
      }

      const timeTaken = formatDuration(apiStart);
      const data = response.data;

      const finalLink = data?.result || data?.destination || data?.url || data?.link || data?.data;
      if (finalLink) {
        return res.json({
          status: 'success',
          result: finalLink,
          time_taken: timeTaken
        });
      }

      if (isUnsupported(data?.message || data?.error || data?.result)) {
        throw new Error('unsupported');
      }
    } catch (err) {
      if (
        (apiName === 'voltar' && hasDomain(voltarOnly)) ||
        (apiName === 'easx' && hasDomain(easOnly))
      ) {
        return res.json({
          status: 'error',
          result: 'Link Not Supported Rip',
          time_taken: formatDuration(apiStart)
        });
      }
      continue;
    }
  }

  return res.json({
    status: 'error',
    result: 'Bypass Failed :(',
    time_taken: formatDuration(handlerStart)
  });
};
