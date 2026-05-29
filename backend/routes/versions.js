const express = require('express');
const router = express.Router();
const versionController = require('../controllers/versionController');

router.post('/:botId/versions', versionController.saveVersion);
router.post('/:botId/autosave', versionController.autosave);
router.get('/:botId/versions', versionController.getVersions);
router.get('/:botId/versions/:versionId', versionController.getVersion);
router.post('/:botId/versions/:versionId/restore', versionController.restoreVersion);

module.exports = router;
