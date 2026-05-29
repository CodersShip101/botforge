const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/me', require('../middleware/auth'), authController.me);
router.get('/plan', require('../middleware/auth'), authController.getPlan);
router.post('/plan/upgrade', require('../middleware/auth'), authController.upgradePlan);

module.exports = router;
