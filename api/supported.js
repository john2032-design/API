const getCurrentTime = () => {
    return process.hrtime.bigint();
};

const calculateDuration = (startTime) => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000;
    return (duration / 1000).toFixed(2);
};

const supportedServices = [
    "1pt.co",
    "adf.ly",
    "adfoc.us",
    "auth.platorelay.com",
    "auth.platoboost.me",
    "auth.platoboost.app",
    "auth.platoboost.net",
    "auth.platoboost.click",
    "bit.do",
    "bit.ly",
    "blink.link",
    "blox-script.com",
    "bly.to",
    "boost.ink",
    "booo.st",
    "bst.gg",
    "bst.wtf",
    "bstshrt.com",
    "cleanuri.org",
    "cl.gy",
    "cuty.io",
    "cuttlinks.com",
    "dub.co",
    "gem-pixel.com",
    "getpolsec.com",
    "getkey.xyz",
    "goo.gl",
    "is.gd",
    "joturl.com",
    "krnl.cat",
    "keyrblx.com",
    "key.valex.io",
    "keyguardian.net",
    "ldnesfs.com",
    "link-hub.net",
    "link-center.net",
    "link-target.net",
    "link-to.net",
    "link4m.com",
    "link4sub.com",
    "linkbucks.com",
    "link-unlock.com",
    "linkunlocker.com",
    "linkvertise.com",
    "linkify.ru",
    "links-loot.com",
    "linksloot.net",
    "linkshrink.com",
    "lockr.so",
    "loot-link.com",
    "loot-links.com",
    "lootlink.org",
    "lootlinks.co",
    "lootdest.info",
    "lootdest.org",
    "lootdest.com",
    "loot-labs.com",
    "lootlabs.com",
    "mboost.me",
    "mediafire.com",
    "nimblelinks.com",
    "nicuse.com",
    "ouo.io",
    "overdrivehub.com",
    "paster.so",
    "paste-drop.com",
    "pastebin.com",
    "pastes.io",
    "pandadevelopment.net",
    "qrco.de",
    "quartyz.com",
    "rebrand.ly",
    "rekonise.com",
    "replug.io",
    "rentry.co",
    "rentry.org",
    "rinku.pro",
    "rkns.link",
    "shorte.st",
    "short.cm",
    "shorter.me",
    "show.co",
    "simpleurl.co",
    "snipit.link",
    "sniply.io",
    "socialwolvez.com",
    "sor.bz",
    "sub2get.com",
    "sub2unlock.com",
    "sub4unlock.com",
    "subfinal.com",
    "t.co",
    "t.ly",
    "tiny.cc",
    "tinylink.onl",
    "tinyurl.com",
    "tpi.li",
    "trigon",
    "v.gd",
    "work.ink",
    "workink.net",
    "ytsubme.com"
];

module.exports = (req, res) => {
    const startTime = getCurrentTime();
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

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