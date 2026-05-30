const db = require('../config/database');
const aiGenerator = require('../services/aiGenerator');

exports.generateStrategy = async (req, res) => {
  try {
    const prompt = req.body.prompt || req.body.description || '';
    const market = req.body.market || 'forex';
    const riskProfile = req.body.riskProfile || req.body.risk || 'moderate';
    const timeframe = req.body.timeframe || 'H1';

    const input = prompt.trim();
    if (input.length < 3) {
      return res.status(400).json({ error: 'Please provide a strategy description (at least 3 characters).' });
    }

    const result = aiGenerator.generateFromPrompt(input, market, riskProfile);

    // Track AI generation
    db.prepare('INSERT INTO ai_generations (user_id, prompt) VALUES (?, ?)').run(req.user.userId, input.slice(0, 500));

    res.json({
      config: result.config,
      summary: result.summary,
      rationale: result.rationale,
      pros: result.pros,
      cons: result.cons,
      suggestedRisk: result.suggestedRisk,
      accuracy: result.accuracy,
      market: result.market,
      riskProfile: result.riskProfile
    });
  } catch (err) {
    console.error('AI generate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.explainStrategy = async (req, res) => {
  try {
    const { configuration } = req.body;
    if (!configuration) {
      return res.status(400).json({ error: 'Strategy configuration is required' });
    }

    const cfg = configuration;
    const strategyName = cfg.strategy || 'Custom';
    const mm = cfg.moneyManagement || {};
    const tm = cfg.tradeManagement || {};
    const er = cfg.entryRules || {};
    const symbol = cfg.symbol || 'EURUSD';
    const tf = cfg.timeFrame || cfg.timeframe || 'H1';

    // Generate rich explanation using aiGenerator logic
    const desc = `${strategyName} ${symbol} ${tf}`;
    const summary = aiGenerator.generateFromPrompt(desc, 'forex', 'moderate');

    const explanation = {
      strategy: strategyName,
      symbol,
      timeframe: tf,
      summary: summary.summary || `This ${strategyName} strategy trades ${symbol} on ${tf}.`,
      entryLogic: er.buySignal ? `Enter on ${er.buySignal} signals for buys and ${er.sellSignal || 'custom'} for sells.` : 'Custom entry rules.',
      risk: `${mm.riskPerTrade || 1}% risk per trade with ${mm.lotSize || 0.1} lot size. ${tm.stopLoss || 50} pip stop loss, ${tm.takeProfit || 100} pip take profit.`,
      rationale: summary.rationale || [],
      config: cfg
    };

    res.json(explanation);
  } catch (err) {
    console.error('AI explain error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
