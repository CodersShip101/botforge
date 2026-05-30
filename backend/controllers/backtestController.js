const db = require('../config/database');
const backtestEngine = require('../services/backtestEngine');

exports.runBacktest = async (req, res) => {
  try {
    const userId = req.userId;
    const { botId, symbol, timeframe, dateStart, dateEnd } = req.body;

    if (!botId) return res.status(400).json({ error: 'botId is required' });

    const bot = db.prepare('SELECT * FROM bots WHERE id = ? AND user_id = ?').get(botId, userId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const cfg = JSON.parse(bot.configuration);

    const bt = db.prepare(
      'INSERT INTO backtests (user_id, bot_id, symbol, timeframe, date_start, date_end, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, botId, symbol || 'EURUSD', timeframe || 'H1', dateStart || '2025-01-01', dateEnd || '2025-06-01', 'running');

    const backtestId = bt.lastInsertRowid;

    // Run simulation
    try {
      const result = backtestEngine.simulate(cfg, symbol, timeframe, dateStart, dateEnd);

      db.prepare(
        "UPDATE backtests SET status = 'completed', progress = 1.0, metrics = ?, trade_count = ?, completed_at = datetime('now') WHERE id = ?"
      ).run(JSON.stringify(result.metrics), result.trades.length, backtestId);

      // Insert trades
      const insertTrade = db.prepare(
        'INSERT INTO backtest_trades (backtest_id, type, entry_price, exit_price, entry_time, exit_time, lots, stop_loss, take_profit, profit, pips, exit_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const t of result.trades) {
        insertTrade.run(backtestId, t.type, t.entry_price, t.exit_price, t.entry_time, t.exit_time, t.lots, t.stop_loss, t.take_profit, t.profit, t.pips, t.exit_reason);
      }

      const backtest = db.prepare('SELECT * FROM backtests WHERE id = ?').get(backtestId);
      backtest.metrics = JSON.parse(backtest.metrics);
      res.json(backtest);
    } catch (simErr) {
      db.prepare("UPDATE backtests SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?").run(simErr.message, backtestId);
      res.status(500).json({ error: 'Backtest simulation failed: ' + simErr.message });
    }
  } catch (err) {
    console.error('Run backtest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getBacktest = async (req, res) => {
  try {
    const { backtestId } = req.params;
    const userId = req.userId;

    const bt = db.prepare('SELECT * FROM backtests WHERE id = ? AND user_id = ?').get(backtestId, userId);
    if (!bt) return res.status(404).json({ error: 'Backtest not found' });

    bt.metrics = JSON.parse(bt.metrics || '{}');
    bt.trades = db.prepare('SELECT * FROM backtest_trades WHERE backtest_id = ? ORDER BY entry_time').all(backtestId);

    res.json(bt);
  } catch (err) {
    console.error('Get backtest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getBotBacktests = async (req, res) => {
  try {
    const { botId } = req.params;
    const userId = req.userId;

    const bot = db.prepare('SELECT id FROM bots WHERE id = ? AND user_id = ?').get(botId, userId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const backtests = db.prepare('SELECT * FROM backtests WHERE bot_id = ? AND user_id = ? ORDER BY created_at DESC').all(botId, userId);
    backtests.forEach(bt => { bt.metrics = JSON.parse(bt.metrics || '{}'); });

    res.json(backtests);
  } catch (err) {
    console.error('Get bot backtests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};