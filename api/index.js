// index.js
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS + preflight
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Helper to safely wrap async handlers
const wrapAsync = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.then === 'function') r.catch(next);
  } catch (err) {
    next(err);
  }
};

// Try to load your bypass handler if present
let bypassHandler = null;
try {
  bypassHandler = require('./bypass'); // expects module.exports = (req, res) => { ... }
  if (typeof bypassHandler !== 'function') bypassHandler = null;
} catch (e) {
  bypassHandler = null;
}

// Register routes
if (bypassHandler) {
  // Keep /bypass separate — do NOT call it from the root status endpoint
  app.get('/bypass', wrapAsync(bypassHandler));
  app.post('/bypass', wrapAsync(bypassHandler));
} else {
  app.all('/bypass', (req, res) => {
    res.status(500).json({
      status: 'error',
      result: 'bypass handler not installed. Place your bypass module at ./bypass.js'
    });
  });
}

// Clean root status — minimal, deterministic, no `apis` or duplicate upstream data
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    result: 'API Proxy Service ready',
    endpoints: {
      '/bypass?url=YOUR_URL': 'Bypass URL shorteners (GET or POST)',
      '/': 'This status endpoint'
    }
  });
});

// Minimal error handler (returns minimal shape)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  res.status(500).json({
    status: 'error',
    result: err && err.message ? err.message : 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(bypassHandler ? 'Loaded ./bypass handler.' : 'No ./bypass handler found.');
});
