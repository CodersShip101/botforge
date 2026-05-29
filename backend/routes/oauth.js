const express = require('express');
const router = express.Router();
const oauthController = require('../controllers/oauthController');

router.get('/:provider', oauthController.initiate);
router.get('/:provider/callback', oauthController.callback);

module.exports = router;