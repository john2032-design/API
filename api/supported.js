const getCurrentTime = () => {
    return process.hrtime.bigint();
};

const calculateDuration = (startTime) => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000;
    return (duration / 1000).toFixed(2);
};

// Combined, deduplicated list of supported shorteners/services (updated for 2025)
const supportedServices = [
    "1pt.co", "adf.ly", "adfoc.us", "auth.platoboost", "bit.do", "bit.ly", "blink.link",
    "blox-script.com", "bly.to", "boost.ink", "bst.gg", "bstshrt.com", "cleanuri.org",
    "cl.gy", "codex.lol (mobile.codex.lol)", "coppy (cuty.io)", "cuttlinks.com", "cuty.io",
    "dub.co", "gem-pixel.com", "getpolsec.com", "getkey.xyz", "goo.gl", "is.gd",
    "joturl.com", "k r n l (krnl.cat)", "key-system (tpi.li key-system)", "key.valex.io",
    "keyguardian.net", "keyguardian.org", "keyrblx.com", "ldnesfs.com", "link-hub.net",
    "link-center.net", "link-target.net", "link-to.net", "link4m.com", "link4sub.com",
    "linkbucks.com", "link-hub", "link-unlock-complete", "link-unlock.com", "linkunlocker.com",
    "linkvertise.com", "linkify.ru", "links-loot.com", "linksloot.net", "linkshrink.com",
    "lockr.xyz", "loot-link.com", "loot-links.com", "lootlink.org", "lootlinks.co",
    "lootdest.info", "lootdest.org", "lootdest.com", "mboost", "mboost.me", "mediafire.com",
    "nimblelinks.com", "nicuse.com", "ouo.io", "overdrivehub.com", "paster.so", "paste.drop",
    "pastebin.com", "pastes.io", "pandadevelopment.net", "qrco.de", "quartyz.com", "rebrand.ly",
    "rekonise.com", "replug.io", "rentry.org", "rinku.pro", "rkns.link", "shorte.st",
    "short.cm", "shorter.me", "shorteners-and-direct.com", "show.co", "simpleurl.co",
    "snipit.link", "sniply.io", "socialwolvez.com", "sor.bz", "sub2get.com", "sub2tech.net",
    "sub2unlock.com", "sub4unlock.com", "sub4unlock.io", "subfinal.com", "t.co", "t.ly",
    "tiny.cc", "tinylink.onl", "tinyurl.com", "tpi.li", "trigon", "trigon (wildcard)",
    "v.gd", "work.ink", "ytsubme.com"
];

module.exports = (req, res) => {
    const startTime = getCurrentTime();
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        const time = calculateDuration(startTime);
        return res.status(405).json({
            status: "error",
            message: "Method not allowed. Use GET.",
            time: time
        });
    }

    const time = calculateDuration(startTime);
    
    res.status(200).json({
        status: "success",
        services: supportedServices,
        time: time
    });
};
