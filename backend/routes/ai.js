const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { requireAIGenerator } = require('../middleware/planLimit');

router.post('/strategy/generate', requireAIGenerator, aiController.generateStrategy);
router.post('/strategy/explain', aiController.explainStrategy);

module.exports = router;
