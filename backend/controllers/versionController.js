const db = require('../config/database');

exports.saveVersion = async (req, res) => {
  try {
    const { botId } = req.params;
    const userId = req.user.userId;

    const bot = db.prepare('SELECT * FROM bots WHERE id = ? AND user_id = ?').get(botId, userId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const maxVer = db.prepare('SELECT MAX(version) AS mv FROM bot_versions WHERE bot_id = ?').get(botId);
    const newVersion = (maxVer && maxVer.mv ? maxVer.mv : 0) + 1;

    db.prepare(
      'INSERT INTO bot_versions (bot_id, version, name, description, configuration) VALUES (?, ?, ?, ?, ?)'
    ).run(botId, newVersion, bot.name, bot.description || '', bot.configuration);

    res.status(201).json({ version: newVersion, message: `Version ${newVersion} saved` });
  } catch (err) {
    console.error('Save version error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.autosave = async (req, res) => {
  try {
    const { botId } = req.params;
    const userId = req.user.userId;
    const { name, description, configuration } = req.body;

    const bot = db.prepare('SELECT * FROM bots WHERE id = ? AND user_id = ?').get(botId, userId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const maxVer = db.prepare('SELECT MAX(version) AS mv FROM bot_versions WHERE bot_id = ?').get(botId);
    const newVersion = (maxVer && maxVer.mv ? maxVer.mv : 0) + 1;

    db.prepare(
      'INSERT INTO bot_versions (bot_id, version, name, description, configuration) VALUES (?, ?, ?, ?, ?)'
    ).run(botId, newVersion, name || bot.name, description !== undefined ? description : (bot.description || ''), JSON.stringify(configuration || JSON.parse(bot.configuration)));

    res.json({ version: newVersion, saved_at: new Date().toISOString() });
  } catch (err) {
    console.error('Autosave error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getVersions = async (req, res) => {
  try {
    const { botId } = req.params;
    const userId = req.user.userId;

    const bot = db.prepare('SELECT id FROM bots WHERE id = ? AND user_id = ?').get(botId, userId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const versions = db.prepare('SELECT id, version, name, created_at FROM bot_versions WHERE bot_id = ? ORDER BY version DESC').all(botId);
    res.json(versions);
  } catch (err) {
    console.error('Get versions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getVersion = async (req, res) => {
  try {
    const { botId, versionId } = req.params;
    const userId = req.user.userId;

    const bot = db.prepare('SELECT id FROM bots WHERE id = ? AND user_id = ?').get(botId, userId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const ver = db.prepare('SELECT * FROM bot_versions WHERE id = ? AND bot_id = ?').get(versionId, botId);
    if (!ver) return res.status(404).json({ error: 'Version not found' });

    ver.configuration = JSON.parse(ver.configuration);
    res.json(ver);
  } catch (err) {
    console.error('Get version error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.restoreVersion = async (req, res) => {
  try {
    const { botId, versionId } = req.params;
    const userId = req.user.userId;

    const ver = db.prepare(
      'SELECT v.* FROM bot_versions v JOIN bots b ON v.bot_id = b.id WHERE v.id = ? AND v.bot_id = ? AND b.user_id = ?'
    ).get(versionId, botId, userId);
    if (!ver) return res.status(404).json({ error: 'Version not found' });

    db.prepare(
      "UPDATE bots SET name = ?, description = ?, configuration = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(ver.name, ver.description || '', ver.configuration, botId, userId);

    const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(botId);
    bot.configuration = JSON.parse(bot.configuration);
    res.json(bot);
  } catch (err) {
    console.error('Restore version error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};