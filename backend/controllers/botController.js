const db = require('../config/database');
const codeGenerator = require('../services/codeGenerator');

function createVersion(botId, botName, botDesc, configuration, label, notes) {
  const maxVer = db.prepare('SELECT MAX(version) AS mv FROM bot_versions WHERE bot_id = ?').get(botId);
  const newVersion = (maxVer && maxVer.mv ? maxVer.mv : 0) + 1;
  db.prepare(
    'INSERT INTO bot_versions (bot_id, version, name, description, configuration, version_label, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(botId, newVersion, botName, botDesc || '', JSON.stringify(configuration || {}), label || '', notes || '');
  return newVersion;
}

exports.createBot = async (req, res) => {
  try {
    const { name, description, configuration } = req.body;
    const userId = req.user.userId;
    if (!name || !configuration) {
      return res.status(400).json({ error: 'Name and configuration are required' });
    }

    const cfgSymbol = configuration.symbol || 'EURUSD';
    const cfgTimeframe = configuration.time_frame || configuration.timeframe || configuration.timeFrame || 'H1';
    const cfgPlatform = (configuration.platform || 'MT4').toUpperCase();

    const info = db.prepare(
      'INSERT INTO bots (user_id, name, description, configuration, symbol, timeframe, platform) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, name, description || '', JSON.stringify(configuration), cfgSymbol, cfgTimeframe, cfgPlatform);

    const botId = info.lastInsertRowid;
    const version = createVersion(botId, name, description, configuration, 'v1');
    const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(botId);
    bot.configuration = JSON.parse(bot.configuration);
    bot.version = version;

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
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    bot.configuration = JSON.parse(bot.configuration);
    const maxVer = db.prepare('SELECT MAX(version) AS mv FROM bot_versions WHERE bot_id = ?').get(botId);
    bot.version = (maxVer && maxVer.mv) || 0;

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
    const { name, description, configuration, version_label, notes } = req.body;

    const existing = db.prepare('SELECT * FROM bots WHERE id = ? AND user_id = ?').get(botId, userId);
    if (!existing) return res.status(404).json({ error: 'Bot not found' });
    existing.configuration = JSON.parse(existing.configuration);

    const finalName = name || existing.name;
    const finalDesc = description !== undefined ? description : existing.description;
    const finalConfig = configuration || existing.configuration;

    const cfgSymbol = finalConfig.symbol || existing.symbol || 'EURUSD';
    const cfgTimeframe = finalConfig.time_frame || finalConfig.timeframe || finalConfig.timeFrame || existing.timeframe || 'H1';
    const cfgPlatform = (finalConfig.platform || existing.platform || 'MT4').toUpperCase();

    db.prepare(
      "UPDATE bots SET name = ?, description = ?, configuration = ?, symbol = ?, timeframe = ?, platform = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(finalName, finalDesc, JSON.stringify(finalConfig), cfgSymbol, cfgTimeframe, cfgPlatform, botId, userId);

    // Auto-create version on config change
    const configChanged = JSON.stringify(finalConfig) !== JSON.stringify(existing.configuration);
    if (configChanged || version_label) {
      createVersion(botId, finalName, finalDesc, finalConfig, version_label || '', notes || '');
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
    if (info.changes === 0) return res.status(404).json({ error: 'Bot not found' });
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
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

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

exports.generateCode = async (req, res) => {
  try {
    const { botId } = req.params;
    const userId = req.user.userId;
    const { platform } = req.body;
    if (platform !== 'MT4' && platform !== 'MT5') {
      return res.status(400).json({ error: 'Platform must be MT4 or MT5' });
    }

    const bot = db.prepare('SELECT * FROM bots WHERE id = ? AND user_id = ?').get(botId, userId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    bot.configuration = JSON.parse(bot.configuration);
    const platLower = platform.toLowerCase();
    const code = codeGenerator.generate(bot, platLower);

    res.json({ code, platform, botName: bot.name });
  } catch (err) {
    console.error('Generate code error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
