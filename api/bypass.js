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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-user-id');
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

  const voltarOnly = ['pandadevelopment.net','auth.plato','work.ink','link4m.com','keyrblx.com','link4sub.com','linkify.ru','sub4unlock.io','sub2unlock','sub2get.com','sub2unlock.net'];

  const isVoltarOnly = voltarOnly.some(d => hostname === d || hostname.endsWith('.' + d));

  const voltarBase = 'https://api.voltar.lol';
  let incomingUserId = '';

  if (isVoltarOnly || hostname === 'work.ink' || hostname.endsWith('.work.ink')) {
    if (req.method === 'POST') {
      incomingUserId = (req.body && (req.body['x_user_id'] || req.body['x-user-id'] || req.body.xUserId)) || '';
      if (!incomingUserId) {
        return res.status(400).json({ status: 'error', result: 'Missing x_user_id in POST body for Voltar', time_taken: formatDuration(handlerStart) });
      }
    } else {
      incomingUserId = (req.headers && (req.headers['x-user-id'] || req.headers['x_user_id'] || req.headers['x-userid'])) || '';
      if (!incomingUserId) {
        return res.status(400).json({ status: 'error', result: 'Missing x-user-id header for Voltar', time_taken: formatDuration(handlerStart) });
      }
    }
  } else {
    if (req.method === 'POST') {
      incomingUserId = (req.body && (req.body['x_user_id'] || req.body['x-user-id'] || req.body.xUserId)) || '';
    } else {
      incomingUserId = (req.headers && (req.headers['x-user-id'] || req.headers['x_user_id'] || req.headers['x-userid'])) || '';
    }
  }

  const voltarHeaders = {
    'x-user-id': incomingUserId || '',
    'x-api-key': '3f9c1e10-7f3e-4a67-939b-b42c18e4d7aa',
    'Content-Type': 'application/json'
  };

  const tryVoltar = async () => {
    const start = getCurrentTime();
    try {
      const createPayload = { url, cache: true };
      if (incomingUserId) createPayload.x_user_id = incomingUserId;
      const createRes = await axios.post(`${voltarBase}/bypass/createTask`, createPayload, { headers: voltarHeaders });
      if (createRes.data.status !== 'success' || !createRes.data.taskId) return { success: false, unsupported: true };
      const taskId = createRes.data.taskId;
      for (let i = 0; i < 140; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const resultRes = await axios.get(`${voltarBase}/bypass/getTaskResult/${taskId}`, {
            headers: {
              'x-api-key': voltarHeaders['x-api-key'],
              'x-user-id': voltarHeaders['x-user-id']
            }
          });
          if (resultRes.data.status === 'success' && resultRes.data.result) {
            res.json({ status: 'success', result: resultRes.data.result, x_user_id: incomingUserId || '', time_taken: formatDuration(start) });
            return { success: true };
          }
        } catch {}
      }
      return { success: false };
    } catch (e) {
      if (e.response?.data?.message && /unsupported|invalid|not supported/i.test(e.response.data.message)) {
        return { success: false, unsupported: true };
      }
      return { success: false };
    }
  };

  const tryOverdrive = async () => {
    const start = getCurrentTime();
    try {
      let puppeteer;
      try {
        puppeteer = require('puppeteer');
      } catch (e) {
        try { puppeteer = require('puppeteer-core'); } catch {}
      }
      if (puppeteer) {
        const browser = await puppeteer.launch({
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          headless: true
        });
        try {
          const page = await browser.newPage();
          await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          const proceedXpathCandidates = [
            "//span[contains(., 'Proceed')]",
            "//p[contains(., 'Proceed')]/parent::*",
            "//*[text()[normalize-space(.)='Proceed']]"
          ];
          let clickedProceed = false;
          for (const xp of proceedXpathCandidates) {
            try {
              const els = await page.$x(xp);
              if (els && els.length) {
                for (const el of els) {
                  try {
                    await el.click({ delay: 100 });
                    clickedProceed = true;
                    break;
                  } catch {}
                }
              }
            } catch {}
            if (clickedProceed) break;
          }
          if (!clickedProceed) {
            try {
              const el = await page.$("span.flex.items-center.space-x-2.muie-full-hl");
              if (el) {
                await el.click({ delay: 100 });
                clickedProceed = true;
              }
            } catch {}
          }
          try {
            await page.waitForFunction(() => location.pathname.includes('/whitelist/checkpoint'), { timeout: 10000 });
          } catch {
            try { await page.waitForTimeout(3000); } catch {}
          }
          let currentUrl = page.url();
          if (!currentUrl.includes('/whitelist/checkpoint')) {
            try {
              const anchors = await page.$$eval('a[href]', a => a.map(x => ({ href: x.getAttribute('href'), text: x.innerText || '' })));
              const checkpointHref = anchors.find(a => a.href && a.href.includes('/whitelist/checkpoint'))?.href;
              if (checkpointHref) {
                await page.goto(new URL(checkpointHref, page.url()).toString(), { waitUntil: 'networkidle2', timeout: 15000 });
              }
            } catch {}
          }
          try {
            await page.waitForSelector('#Proceed-Text', { timeout: 8000 });
            const cont = await page.$('#Proceed-Text');
            if (cont) {
              try {
                await cont.click({ delay: 100 });
              } catch {
                try {
                  const parent = (await cont.getProperty('parentNode')).asElement();
                  if (parent) await parent.click({ delay: 100 });
                } catch {}
              }
            }
          } catch {
            try {
              const el = await page.$x("//*[text()[normalize-space(.)='Continue']]");
              if (el && el.length) {
                await el[0].click({ delay: 100 });
              }
            } catch {}
          }
          try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
          } catch {
            try { await page.waitForTimeout(2000); } catch {}
          }
          const finalUrl = page.url();
          if (finalUrl.includes('/whitelist/checkpoint') || finalUrl === url) {
            try {
              const anchors = await page.$$eval('a[href]', a => a.map(x => x.getAttribute('href')));
              const candidate = anchors.find(h => h && (h.includes('http') || h.startsWith('/')));
              if (candidate) {
                const resolved = new URL(candidate, page.url()).toString();
                await browser.close();
                const r = await axios.get(resolved, { headers: { Accept: 'text/html,application/json,*/*' }, maxRedirects: 5 });
                return { status: 'success', result: r.data, time_taken: formatDuration(start) };
              }
            } catch {}
          }
          await browser.close();
          try {
            const r = await axios.get(finalUrl, { headers: { Accept: 'text/html,application/json,*/*' }, maxRedirects: 5 });
            return { status: 'success', result: r.data, time_taken: formatDuration(start) };
          } catch (e) {
            return { status: 'error', result: `Fetch after click failed: ${String(e.message || e)}`, time_taken: formatDuration(start) };
          }
        } catch (errInner) {
          try { await browser.close(); } catch {}
          return { status: 'error', result: `Puppeteer flow failed: ${String(errInner.message || errInner)}`, time_taken: formatDuration(start) };
        }
      } else {
        const r1 = await axios.get(url, { headers: { Accept: 'text/html,*/*' }, maxRedirects: 5 });
        const body = String(r1.data || '');
        const hrefMatch = body.match(/href=["']([^"']*\/whitelist\/checkpoint[^"']*)["']/i);
        if (hrefMatch) {
          const checkpointUrl = new URL(hrefMatch[1], r1.request?.res?.responseUrl || url).toString();
          const r2 = await axios.get(checkpointUrl, { headers: { Accept: 'text/html,*/*' }, maxRedirects: 5 });
          const body2 = String(r2.data || '');
          const contHref = body2.match(/href=["']([^"']*?)["'][^>]*id=["']Proceed-Text["']/i) ||
                           body2.match(/id=["']Proceed-Text["'][^>]*>[\s\S]*?href=["']([^"']*?)["']/i) ||
                           body2.match(/form[^>]+action=["']([^"']*whitelist[^"']*)["']/i);
          if (contHref && contHref[1]) {
            const finalResolved = new URL(contHref[1], r2.request?.res?.responseUrl || checkpointUrl).toString();
            const r3 = await axios.get(finalResolved, { headers: { Accept: 'text/html,application/json,*/*' }, maxRedirects: 5 });
            return { status: 'success', result: r3.data, time_taken: formatDuration(start) };
          } else {
            return { status: 'success', result: body2, time_taken: formatDuration(start) };
          }
        } else {
          return { status: 'error', result: 'Proceed link not found (fallback)', time_taken: formatDuration(start) };
        }
      }
    } catch (e) {
      return { status: 'error', result: `Overdrive handling exception: ${String(e.message || e)}`, time_taken: formatDuration(start) };
    }
  };

  const tryBstlar = async () => {
    const start = getCurrentTime();
    try {
      let parsedUrl;
      try { parsedUrl = new URL(url); } catch { parsedUrl = null; }
      const path = parsedUrl ? parsedUrl.pathname.substring(1) : url;
      const apiGet = await axios.get(`https://bstlar.com/api/link?url=${encodeURIComponent(path)}`, {
        headers: {
          "accept": "application/json, text/plain, */*",
          "accept-language": "en-US,en;q=0.9",
          "authorization": "null",
          "Referer": url,
          "Referrer-Policy": "same-origin"
        },
        timeout: 15000
      });
      const data = apiGet.data;
      if (!(data && data.tasks && Array.isArray(data.tasks) && data.tasks.length > 0)) {
        throw new Error("No tasks found in response!");
      }
      const linkId = data.tasks[0].link_id;
      const apiPost = await axios.post("https://bstlar.com/api/link-completed", { link_id: linkId }, {
        headers: {
          "accept": "application/json, text/plain, */*",
          "content-type": "application/json;charset=UTF-8",
          "authorization": "null",
          "Referer": url,
          "Referrer-Policy": "same-origin"
        },
        timeout: 15000,
        responseType: "text"
      });
      let finalLink = apiPost.data;
      if (typeof finalLink === 'object') finalLink = finalLink?.result || finalLink?.link || finalLink?.url || finalLink?.destination || JSON.stringify(finalLink);
      finalLink = String(finalLink || '');
      if (finalLink.length === 0) return false;
      res.json({ status: 'success', result: finalLink, x_user_id: incomingUserId || '', time_taken: formatDuration(start) });
      return true;
    } catch (e) {
      if (e.response?.status === 404) return 'unsupported';
      const msg = e.response?.data?.message || e.response?.data?.error || e.message || '';
      if (String(msg).match(/unsupported|not supported|missing_url/i)) return 'unsupported';
      return false;
    }
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
      return res.json({ status: 'success', result: decrypted, x_user_id: incomingUserId || '', time_taken: formatDuration(start) });
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
      return res.json({ status: 'success', result: keyText, x_user_id: incomingUserId || '', time_taken: formatDuration(start) });
    } catch (e) {
      return res.status(500).json({ status: 'error', result: `Key fetch failed: ${String(e.message || e)}`, time_taken: formatDuration(handlerStart) });
    }
  }

  if (hostname === 'overdrivehub.xyz' || hostname.endsWith('.overdrivehub.xyz')) {
    const r = await tryOverdrive();
    if (r && r.status === 'success') return res.json({ ...r, x_user_id: incomingUserId || '' });
    if (r && r.status === 'error') return res.status(500).json({ ...r, x_user_id: incomingUserId || '' });
    return res.status(500).json({ status: 'error', result: 'Overdrive bypass failed', x_user_id: incomingUserId || '', time_taken: formatDuration(handlerStart) });
  }

  if (hostname === 'bstlar.com' || hostname.endsWith('.bstlar.com')) {
    const r = await tryBstlar();
    if (r === true) return;
    return res.json({ status: 'error', result: 'Bypass Failed :(', x_user_id: incomingUserId || '', time_taken: formatDuration(handlerStart) });
  }

  if (isVoltarOnly || hostname === 'work.ink' || hostname.endsWith('.work.ink')) {
    const voltarResult = await tryVoltar();
    if (voltarResult.success) return;
    return res.json({ status: 'error', result: 'Bypass Failed :(', x_user_id: incomingUserId || '', time_taken: formatDuration(handlerStart) });
  }

  const voltarResult = await tryVoltar();
  if (voltarResult.success) return;

  res.json({ status: 'error', result: 'Bypass Failed :(', x_user_id: incomingUserId || '', time_taken: formatDuration(handlerStart) });
};
