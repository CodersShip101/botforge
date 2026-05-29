const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');
const { checkBotLimit } = require('../middleware/planLimit');

router.get('/', botController.getUserBots);
router.post('/', checkBotLimit, botController.createBot);
router.get('/:botId', botController.getBot);
router.put('/:botId', botController.updateBot);
router.delete('/:botId', botController.deleteBot);
router.get('/:botId/download', botController.downloadBot);

module.exports = router;
