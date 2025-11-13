const getCurrentTime = () => {
    return process.hrtime.bigint();
};

const calculateDuration = (startTime) => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000;
    return (duration / 1000).toFixed(2);
};

const supportedServices = [
    "Codex", "Trigon", "rekonise", "linkvertise", "paster-so", "cuttlinks", 
    "boost-ink-and-bst-gg", "keyguardian", "bstshrt", "nicuse-getkey", 
    "bit.do", "bit.ly", "blox-script", "cl.gy", "cuty-cuttlinks", "getpolsec", 
    "goo.gl", "is.gd", "ldnesfspublic", "link-hub.net", "link-unlock-complete", 
    "link4m.com", "link4sub", "linkunlocker", "lockr", "mboost", "mediafire", 
    "overdrivehub", "paste-drop", "pastebin", "pastes_io", "quartyz", 
    "rebrand.ly", "rinku-pro", "rkns.link", "shorteners-and-direct", 
    "shorter.me", "socialwolvez", "sub2get", "sub4unlock.com", "subfinal", 
    "t.co", "t.ly", "tiny.cc", "tinylink.onl", "tinyurl.com", 
    "tpi.li key-system", "v.gd", "work-ink", "ytsubme"
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
