const express = require('express');
const passport = require('passport');
const authController = require('../controllers/authController');
const oauthController = require('../controllers/oauthController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authMiddleware, authController.getCurrentUser);
router.post('/logout', authMiddleware, authController.logout);

router.get('/oauth/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get(
  '/oauth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html?error=oauth_failed', session: false }),
  oauthController.googleCallback
);

router.get('/oauth/facebook', passport.authenticate('facebook', { scope: ['email'], session: false }));
router.get(
  '/oauth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login.html?error=oauth_failed', session: false }),
  oauthController.facebookCallback
);

router.post('/link-oauth', authMiddleware, oauthController.linkOAuth);
router.delete('/oauth/:provider', authMiddleware, oauthController.unlinkOAuth);

module.exports = router;
