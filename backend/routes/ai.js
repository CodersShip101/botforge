const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const authenticateToken = require('../middleware/auth');
const { requireAIGenerator } = require('../middleware/planLimit');

router.use(authenticateToken);

router.post('/strategy/generate', requireAIGenerator, aiController.generateStrategy);
router.post('/strategy/explain', aiController.explainStrategy);

module.exports = router;