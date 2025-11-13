const express = require('express');
const axios = require('axios');
const app = express();
const port = 3000;

// Middleware to parse JSON
app.use(express.json());

// Supported services list
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

// Helper function to calculate time in seconds with 2 decimal places
const getCurrentTime = () => {
    return process.hrtime.bigint();
};

const calculateDuration = (startTime) => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    return (duration / 1000).toFixed(2); // Convert to seconds with 2 decimal places
};

// Bypass endpoint
app.get('/bypass', async (req, res) => {
    const startTime = getCurrentTime();
    const url = req.query.url;
    
    if (!url) {
        const time = calculateDuration(startTime);
        return res.json({
            status: "error",
            message: "URL parameter is required",
            time: time
        });
    }

    try {
        const apiUrl = `http://ace-bypass.com/api/bypass?url=${encodeURIComponent(url)}&apikey=FREE_S7MdXC0momgajOEx1_UKW7FQUvbmzvalu0gTwr-V6cI`;
        
        const response = await axios.get(apiUrl);
        const data = response.data;
        const time = calculateDuration(startTime);

        // Transform the response according to requirements
        if (data.error) {
            return res.json({
                status: "error",
                message: data.message || "An error occurred",
                time: time
            });
        } else {
            return res.json({
                status: "success",
                result: data.result || data,
                time: time
            });
        }
    } catch (error) {
        const time = calculateDuration(startTime);
        return res.json({
            status: "error",
            message: error.message,
            time: time
        });
    }
});

// Supported services endpoint
app.get('/supported', (req, res) => {
    const startTime = getCurrentTime();
    const time = calculateDuration(startTime);
    
    res.json({
        status: "success",
        services: supportedServices,
        time: time
    });
});

// Root endpoint
app.get('/', (req, res) => {
    const startTime = getCurrentTime();
    const time = calculateDuration(startTime);
    
    res.json({
        status: "success",
        message: "API Proxy Service",
        endpoints: {
            "/bypass?url=YOUR_URL": "Bypass URL shorteners",
            "/supported": "List of supported services"
        },
        time: time
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
