const express = require('express');
const router = express.Router();
const backtestController = require('../controllers/backtestController');
const { checkBacktestLimit } = require('../middleware/planLimit');

router.post('/', checkBacktestLimit, backtestController.runBacktest);
router.get('/:backtestId', backtestController.getBacktest);
router.get('/bot/:botId', backtestController.getBotBacktests);

module.exports = router;
