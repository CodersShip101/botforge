const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const db = require('./config/database');
const authRoutes = require('./routes/auth');
const botRoutes = require('./routes/bots');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// Serve frontend files (parent directory)
app.use(express.static(path.join(__dirname, '..')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/auth/oauth', require('./routes/oauth'));
app.use('/api/bots', botRoutes);
app.use('/api/bots', require('./routes/versions'));
app.use('/api/backtests', require('./routes/backtests'));
app.use('/api/ai', require('./routes/ai'));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  (async () => {
    await db.init();
    await new Promise(resolve => {
      app.listen(PORT, () => {
        console.log(`VANTIS AI API running on port ${PORT}`);
        resolve();
      });
    });
  })();
}

module.exports = app;
