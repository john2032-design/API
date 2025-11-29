const getCurrentTime = () => {
    return process.hrtime.bigint();
};

const calculateDuration = (startTime) => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000;
    return (duration / 1000).toFixed(2);
};

// Combined, deduplicated list of supported shorteners/services
const supportedServices = [
    "bit.do", "bit.ly", "blox-script.com", "boost.ink", "bst.gg", "bstshrt.com",
    "cl.gy", "codex.lol (mobile.codex.lol)", "coppy (cuty.io)", "cuttlinks.com",
    "cuty.io", "getpolsec.com", "getkey.xyz", "goo.gl", "is.gd", "k r n l (krnl.cat)",
    "keyguardian.net", "keyguardian.org", "keyrblx.com", "ldnesfs.com", "link-hub.net",
    "link-center.net", "link-target.net", "link-to.net", "link4m.com", "link4sub.com",
    "link-unlock.com", "linkunlocker.com", "linkvertise.com", "links-loot.com",
    "linksloot.net", "loot-link.com", "loot-links.com", "lootlink.org", "lootlinks.co",
    "lootdest.info", "lootdest.org", "lootdest.com", "mboost.me", "mediafire.com",
    "nicuse.com", "overdrivehub.com", "paster.so", "paste.drop", "pastebin.com",
    "pastes.io", "pandadevelopment.net", "quartyz.com", "rentry.org", "rebrand.ly",
    "rinku.pro", "rkns.link", "shorteners-and-direct.com", "shorter.me", "socialwolvez.com",
    "sub2get.com", "sub4unlock.com", "subfinal.com", "t.co", "t.ly", "tiny.cc",
    "tinylink.onl", "tinyurl.com", "tpi.li", "trigon", "trigon (wildcard)",
    "v.gd", "work.ink", "ytsubme.com", "rekonise.com", "key-system (tpi.li key-system)",
    "lockr.xyz", "mboost", "link-hub", "link-unlock-complete"
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
