const axios = require('axios');

const getCurrentTime = () => {
    return process.hrtime.bigint();
};

const calculateDuration = (startTime) => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000;
    return (duration / 1000).toFixed(2);
};

module.exports = async (req, res) => {
    const startTime = getCurrentTime();
    
    // Set CORS headers for browser compatibility
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

    const url = req.query.url;
    
    if (!url) {
        const time = calculateDuration(startTime);
        return res.status(400).json({
            status: "error",
            message: "URL parameter is required",
            time: time
        });
    }

    try {
        const apiUrl = `http://ace-bypass.com/api/bypass?url=${encodeURIComponent(url)}&apikey=FREE_S7MdXC0momgajOEx1_UKW7FQUvbmzvalu0gTwr-V6cI`;
        
        const response = await axios.get(apiUrl, {
            timeout: 10000 // 10 second timeout
        });
        const data = response.data;
        const time = calculateDuration(startTime);

        // Transform the response according to requirements
        if (data.error) {
            return res.status(200).json({
                status: "error",
                message: data.message || "An error occurred",
                time: time
            });
        } else {
            return res.status(200).json({
                status: "success",
                result: data.result || data,
                time: time
            });
        }
    } catch (error) {
        const time = calculateDuration(startTime);
        
        let errorMessage = "An unexpected error occurred";
        if (error.code === 'ECONNREFUSED') {
            errorMessage = "Unable to connect to bypass service";
        } else if (error.code === 'ETIMEDOUT') {
            errorMessage = "Request timeout - service unavailable";
        } else if (error.response) {
            errorMessage = `Service error: ${error.response.status}`;
        } else if (error.message) {
            errorMessage = error.message;
        }

        return res.status(500).json({
            status: "error",
            message: errorMessage,
            time: time
        });
    }
};
