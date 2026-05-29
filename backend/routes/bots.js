const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken);

router.post('/', botController.createBot);
router.get('/', botController.getUserBots);
router.get('/:botId', botController.getBot);
router.put('/:botId', botController.updateBot);
router.delete('/:botId', botController.deleteBot);
router.get('/:botId/download', botController.downloadBot);

module.exports = router;
