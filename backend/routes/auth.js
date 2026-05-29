const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

// Rate limiters
const signinLimiter = rateLimit({ windowMs: 60000, max: 10, keyFn: req => `signin:${req.ip}` });
const signupLimiter = rateLimit({ windowMs: 3600000, max: 5, keyFn: req => `signup:${req.ip}` });
const forgotLimiter = rateLimit({ windowMs: 60000, max: 3, keyFn: req => `forgot:${req.ip}` });

// Blueprint endpoints
router.post('/signup', signupLimiter, authController.signup);
router.post('/signin', signinLimiter, authController.signin);
router.post('/signout', authenticateToken, authController.signout);
router.post('/refresh', authController.refresh);
router.post('/verify-email/request', rateLimit({ windowMs: 60000, max: 3 }), authController.verifyEmailRequest);
router.post('/verify-email/confirm', authController.verifyEmailConfirm);
router.post('/password/forgot', forgotLimiter, authController.forgotPassword);
router.post('/password/reset', authController.resetPassword);

// Legacy backward-compat endpoints
router.post('/register', signupLimiter, authController.register);
router.post('/login', signinLimiter, authController.login);

// Authenticated endpoints
router.get('/me', authenticateToken, authController.me);
router.get('/plan', authenticateToken, authController.getPlan);
router.post('/plan/upgrade', authenticateToken, authController.upgradePlan);
router.get('/sessions', authenticateToken, authController.getSessions);
router.delete('/sessions/:id', authenticateToken, authController.revokeSession);
router.post('/sessions/logout-all', authenticateToken, authController.revokeAllSessions);

module.exports = router;