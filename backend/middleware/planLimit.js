const db = require('../config/database');

const PLAN_LIMITS = {
  free: { bots: 1, backtests: 3, ai_generate: 0 },
  pro: { bots: 999, backtests: 50, ai_generate: 20 },
  elite: { bots: 9999, backtests: 200, ai_generate: 100 }
};

function getUserPlan(userId) {
  const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(userId);
  return (user && user.plan) || 'free';
}

function getUsage(userId, type) {
  if (type === 'bots') {
    return db.prepare('SELECT COUNT(*) AS cnt FROM bots WHERE user_id = ?').get(userId).cnt;
  }
  if (type === 'backtests') {
    return db.prepare("SELECT COUNT(*) AS cnt FROM backtests WHERE user_id = ? AND date(created_at) = date('now')").get(userId).cnt;
  }
  if (type === 'ai_generate') {
    return db.prepare("SELECT COUNT(*) AS cnt FROM ai_generations WHERE user_id = ? AND date(created_at) = date('now')").get(userId)?.cnt || 0;
  }
  return 0;
}

function planLimit(type) {
  return (req, res, next) => {
    const userId = req.user.userId;
    const plan = getUserPlan(userId);
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    const limit = limits[type];
    if (limit === undefined) return next();

    if (limit === 0) {
      return res.status(403).json({
        error: `${type === 'ai_generate' ? 'AI Strategy Generator' : 'This feature'} is not available on the ${plan} plan. Upgrade to Pro or Elite.`
      });
    }

    const usage = getUsage(userId, type);
    if (usage >= limit) {
      const labels = { bots: 'bots', backtests: 'daily backtests', ai_generate: 'AI generations today' };
      return res.status(403).json({
        error: `Plan limit reached. You have used ${usage}/${limit} ${labels[type] || 'units'} on the ${plan} plan. Upgrade for more.`
      });
    }
    next();
  };
}

// Legacy middleware functions
function checkBotLimit(req, res, next) { return planLimit('bots')(req, res, next); }
function checkBacktestLimit(req, res, next) { return planLimit('backtests')(req, res, next); }
function requireAIGenerator(req, res, next) { return planLimit('ai_generate')(req, res, next); }
function requireAdvancedBacktesting(req, res, next) { return planLimit('backtests')(req, res, next); }

module.exports = { PLAN_LIMITS, getUserPlan, planLimit, checkBotLimit, checkBacktestLimit, requireAIGenerator, requireAdvancedBacktesting };
