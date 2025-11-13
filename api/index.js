const getCurrentTime = () => {
    return process.hrtime.bigint();
};

const calculateDuration = (startTime) => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000;
    return (duration / 1000).toFixed(2);
};

module.exports = (req, res) => {
    const startTime = getCurrentTime();
    const time = calculateDuration(startTime);
    
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
        status: "success",
        message: "API Proxy Service",
        endpoints: {
            "/bypass?url=YOUR_URL": "Bypass URL shorteners",
            "/supported": "List of supported services"
        },
        time: time
    });
};
