// /api/index.js
module.exports = (req, res) => {
  // Simple, deterministic root status — will not include upstream 'apis'
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    status: 'success',
    result: 'API Proxy Service ready',
    endpoints: {
      '/api/bypass?url=YOUR_URL': 'Bypass URL shorteners (GET or POST)'
    }
  });
};
