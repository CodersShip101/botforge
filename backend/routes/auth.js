// Auth is handled by Clerk on the frontend.
// Backend sync is done via POST /api/auth/sync in server.js
const express = require('express');
const router = express.Router();

// Clerk handles all auth; no custom endpoints needed
router.get('/config', (req, res) => res.json({ auth: 'clerk' }));

module.exports = router;
