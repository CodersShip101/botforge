const aiGenerator = require('../services/aiGenerator');

exports.generateStrategy = async (req, res) => {
  try {
    const { description, market, timeframe, riskProfile } = req.body;

    if (!description || description.trim().length < 3) {
      return res.status(400).json({ error: 'Please provide a strategy description (at least 3 characters).' });
    }

    const result = aiGenerator.generateFromDescription(description, market, timeframe, riskProfile);

    res.json(result);
  } catch (err) {
    console.error('AI generate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.explainStrategy = async (req, res) => {
  try {
    const { configuration } = req.body;
    if (!configuration || !configuration.strategy) {
      return res.status(400).json({ error: 'Valid strategy configuration is required' });
    }

    const cfg = configuration;
    const strategyName = cfg.strategy || 'Custom';
    const mm = cfg.moneyManagement || {};
    const tm = cfg.tradeManagement || {};
    const er = cfg.entryRules || {};

    const explanation = {
      strategy: strategyName,
      summary: `This ${strategyName} strategy trades ${cfg.symbol || 'EURUSD'} on the ${cfg.timeFrame || 'H1'} timeframe.`,
      entry_logic: `Enter on ${er.buySignal || 'custom'} signals for buys and ${er.sellSignal || 'custom'} for sells.`,
      risk: `${mm.riskPerTrade || 1}% risk per trade with ${mm.lotSize || 0.1} lot size. ${tm.stopLoss || 50} pip stop loss, ${tm.takeProfit || 100} pip take profit.`,
      details: cfg
    };

    res.json(explanation);
  } catch (err) {
    console.error('AI explain error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};