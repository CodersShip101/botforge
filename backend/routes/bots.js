const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');
const authenticateToken = require('../middleware/auth');
const { checkBotLimit } = require('../middleware/planLimit');

router.use(authenticateToken);

router.post('/', (req, res, next) => {
  if (!req.body.name) return next(); // skip limit check, controller will return 400
  checkBotLimit(req, res, next);
}, botController.createBot);
router.get('/', botController.getUserBots);
router.get('/:botId', botController.getBot);
router.put('/:botId', botController.updateBot);
router.delete('/:botId', botController.deleteBot);
router.get('/:botId/download', botController.downloadBot);

module.exports = router;