// index.js
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic CORS + preflight handling (matches your other handlers)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Helper: wrap possibly-async exported handlers so thrown rejections are forwarded to Express
const wrapAsync = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    // If it returns a promise, catch errors
    if (r && typeof r.then === 'function') r.catch(next);
  } catch (err) {
    next(err);
  }
};

// --- /bypass route (uses your bypass module if present) ---
let bypassHandler = null;
try {
  // Accept both ./bypass.js or ./bypass/index.js paths depending on your layout
  bypassHandler = require('./bypass');
  if (typeof bypassHandler !== 'function') {
    console.warn('Loaded ./bypass but it did not export a function. Falling back to error handler.');
    bypassHandler = null;
  }
} catch (e) {
  console.warn('No local ./bypass module found; /bypass route will report an error. (This is fine if you run serverless functions instead.)');
}

if (bypassHandler) {
  // Allow GET (your handler expects GET) and OPTIONS handled globally
  app.get('/bypass', wrapAsync(bypassHandler));
  // Also accept POST to /bypass for testing compatibility (if your handler accepts body)
  app.post('/bypass', wrapAsync(bypassHandler));
} else {
  // Fallback: informative 500 so you know to drop your bypass module in place
  app.all('/bypass', (req, res) => {
    res.status(500).json({
      status: 'error',
      result: 'bypass handler not installed on server. Place your bypass module at ./bypass.js'
    });
  });
}

// --- Root status endpoint ---
// If you have your own root/status handler file, you can change this to require it.
// This default returns a minimal description similar to your earlier handler.
app.get('/', (req, res) => {
  const uptime = process.uptime();
  res.json({
    status: 'success',
    result: 'API Proxy Service',
    time: `${uptime.toFixed(2)}s`,
    endpoints: {
      '/bypass?url=YOUR_URL': 'Bypass URL shorteners (GET)',
      '/': 'This status endpoint'
    }
  });
});

// --- Error handling middleware ---
app.use((err, req, res, next) => {
  console.error('Unhandled error in request:', err && err.stack ? err.stack : err);
  // Try to return the minimal shape you asked for
  res.status(500).json({
    status: 'error',
    result: err && err.message ? err.message : 'Internal server error'
  });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  if (bypassHandler) {
    console.log('Loaded ./bypass handler. /bypass is available.');
  } else {
    console.log('No ./bypass handler found. /bypass will return an informative error until you add ./bypass.js');
  }
});
