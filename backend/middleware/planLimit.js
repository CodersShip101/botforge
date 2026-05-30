const db = require('../config/database');

const PLAN_LIMITS = {
  free: { maxBots: 1, maxBacktestsPerDay: 3, aiGenerator: false, advancedBacktesting: false },
  pro: { maxBots: 999, maxBacktestsPerDay: 50, aiGenerator: true, advancedBacktesting: true },
  elite: { maxBots: 9999, maxBacktestsPerDay: 200, aiGenerator: true, advancedBacktesting: true }
};

function getUserPlan(userId) {
  const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(userId);
  return (user && user.plan) || 'free';
}

function checkBotLimit(req, res, next) {
  const userId = req.userId;
  const plan = getUserPlan(userId);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  const count = db.prepare('SELECT COUNT(*) AS cnt FROM bots WHERE user_id = ?').get(userId);
  if (count.cnt >= limits.maxBots) {
    return res.status(403).json({
      error: `Plan limit reached. You can have up to ${limits.maxBots} bot(s) on the ${plan} plan. Upgrade to create more.`
    });
  }
  next();
}

function checkBacktestLimit(req, res, next) {
  const userId = req.userId;
  const plan = getUserPlan(userId);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  const today = db.prepare(
    "SELECT COUNT(*) AS cnt FROM backtests WHERE user_id = ? AND date(created_at) = date('now')"
  ).get(userId);
  if (today.cnt >= limits.maxBacktestsPerDay) {
    return res.status(403).json({
      error: `Daily backtest limit reached. You can run up to ${limits.maxBacktestsPerDay} backtest(s) per day on the ${plan} plan.`
    });
  }
  next();
}

function requireAIGenerator(req, res, next) {
  const userId = req.userId;
  const plan = getUserPlan(userId);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  if (!limits.aiGenerator) {
    return res.status(403).json({ error: 'AI Strategy Generator is available on Pro and Elite plans.' });
  }
  next();
}

function requireAdvancedBacktesting(req, res, next) {
  const userId = req.userId;
  const plan = getUserPlan(userId);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  if (!limits.advancedBacktesting) {
    return res.status(403).json({ error: 'Advanced backtesting is available on Pro and Elite plans.' });
  }
  next();
}

module.exports = { PLAN_LIMITS, getUserPlan, checkBotLimit, checkBacktestLimit, requireAIGenerator, requireAdvancedBacktesting };