const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { planLimit } = require('../middleware/planLimit');

router.post('/strategy/generate', planLimit('ai_generate'), aiController.generateStrategy);
router.post('/strategy/explain', aiController.explainStrategy);

module.exports = router;
