const db = require('../config/database');
const codeGenerator = require('../services/codeGenerator');

exports.createBot = async (req, res) => {
  try {
    const { name, description, configuration } = req.body;
    const userId = req.user.userId;

    if (!name || !configuration) {
      return res.status(400).json({ error: 'Name and configuration are required' });
    }

    const info = db.prepare(
      'INSERT INTO bots (user_id, name, description, configuration) VALUES (?, ?, ?, ?)'
    ).run(userId, name, description || '', JSON.stringify(configuration));

    const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(info.lastInsertRowid);
    bot.configuration = JSON.parse(bot.configuration);

    res.status(201).json(bot);
  } catch (err) {
    console.error('Create bot error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getUserBots = async (req, res) => {
  try {
    const userId = req.user.userId;

    const bots = db.prepare('SELECT * FROM bots WHERE user_id = ? ORDER BY created_at DESC').all(userId);

    res.json(bots.map(bot => ({
      ...bot,
      configuration: JSON.parse(bot.configuration)
    })));
  } catch (err) {
    console.error('Get bots error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getBot = async (req, res) => {
  try {
    const { botId } = req.params;
    const userId = req.user.userId;

    const bot = db.prepare('SELECT * FROM bots WHERE id = ? AND user_id = ?').get(botId, userId);

    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    bot.configuration = JSON.parse(bot.configuration);

    res.json(bot);
  } catch (err) {
    console.error('Get bot error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.updateBot = async (req, res) => {
  try {
    const { botId } = req.params;
    const userId = req.user.userId;
    const { name, description, configuration } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const info = db.prepare(
      "UPDATE bots SET name = ?, description = ?, configuration = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(name, description || '', JSON.stringify(configuration || {}), botId, userId);

    if (info.changes === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(botId);
    bot.configuration = JSON.parse(bot.configuration);

    res.json(bot);
  } catch (err) {
    console.error('Update bot error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.deleteBot = async (req, res) => {
  try {
    const { botId } = req.params;
    const userId = req.user.userId;

    const info = db.prepare('DELETE FROM bots WHERE id = ? AND user_id = ?').run(botId, userId);

    if (info.changes === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    res.json({ message: 'Bot deleted successfully' });
  } catch (err) {
    console.error('Delete bot error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.downloadBot = async (req, res) => {
  try {
    const { botId } = req.params;
    const userId = req.user.userId;
    const platform = req.query.platform || 'mt4';

    if (platform !== 'mt4' && platform !== 'mt5') {
      return res.status(400).json({ error: 'Platform must be mt4 or mt5' });
    }

    const bot = db.prepare('SELECT * FROM bots WHERE id = ? AND user_id = ?').get(botId, userId);

    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    bot.configuration = JSON.parse(bot.configuration);

    const ext = platform === 'mt4' ? 'mq4' : 'mq5';
    const code = codeGenerator.generate(bot, platform);

    db.prepare('INSERT INTO downloads (bot_id, user_id, platform) VALUES (?, ?, ?)').run(botId, userId, platform);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${bot.name.replace(/\s+/g, '_')}.${ext}"`);
    res.send(code);
  } catch (err) {
    console.error('Download bot error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
