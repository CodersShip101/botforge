const express = require('express');
const passport = require('passport');
const authController = require('../controllers/authController');
const oauthController = require('../controllers/oauthController');
const { authMiddleware } = require('../middleware/auth');
const validation = require('../middleware/validation');

const router = express.Router();

router.post('/register', validation.validateRegister, authController.register);
router.post('/login', validation.validateLogin, authController.login);
router.get('/me', authMiddleware, authController.getCurrentUser);
router.post('/logout', authMiddleware, authController.logout);

router.post('/verify-email', validation.validateToken, authController.verifyEmail);
router.post('/resend-verification', validation.validateEmailOnly, authController.resendVerificationEmail);

router.post('/forgot-password', validation.validateEmailOnly, authController.forgotPassword);
router.post('/verify-reset-token', validation.validateToken, authController.verifyResetToken);
router.post('/reset-password', validation.validatePasswordReset, authController.resetPassword);
router.post('/change-password', authMiddleware, validation.validatePasswordReset, authController.changePassword);

router.get('/oauth/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get(
  '/oauth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html?error=google_auth_failed', session: false }),
  oauthController.googleCallback
);

router.get('/oauth/facebook', passport.authenticate('facebook', { scope: ['email'], session: false }));
router.get(
  '/oauth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login.html?error=facebook_auth_failed', session: false }),
  oauthController.facebookCallback
);

router.post('/link-oauth', authMiddleware, oauthController.linkOAuth);
router.delete('/oauth/:provider', authMiddleware, oauthController.unlinkOAuth);

module.exports = router;
