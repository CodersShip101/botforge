function generateFromDescription(description, market, timeframe, riskProfile) {
  const desc = (description || '').toLowerCase();
  const tf = timeframe || 'H1';

  let strategy = 'trend_following';
  if (desc.includes('grid')) strategy = 'grid';
  else if (desc.includes('martin') || desc.includes('double')) strategy = 'martingale';
  else if (desc.includes('hedge')) strategy = 'hedging';
  else if (desc.includes('trend') || desc.includes('momentum') || desc.includes('ma') || desc.includes('moving average') || desc.includes('crossover')) strategy = 'trend_following';
  else if (desc.includes('scalp') || desc.includes('quick') || desc.includes('fast')) strategy = 'scalping';
  else if (desc.includes('breakout') || desc.includes('break out') || desc.includes('range')) strategy = 'grid';
  else if (desc.includes('mean') || desc.includes('reversal') || desc.includes('rsi') || desc.includes('bollinger')) strategy = 'hedging';

  const risk = riskProfile || 'moderate';
  let riskPerTrade = 1.0;
  let maxDailyLoss = 500;
  let maxDailyProfit = 1000;
  let lotSize = 0.1;

  if (risk === 'conservative') { riskPerTrade = 0.5; maxDailyLoss = 200; lotSize = 0.05; }
  else if (risk === 'aggressive') { riskPerTrade = 2.0; maxDailyLoss = 1000; maxDailyProfit = 2000; lotSize = 0.2; }

  let buySignal = 'MA_CROSSOVER';
  let sellSignal = 'RSI_OVERBOUGHT';
  let trendFilter = 'EMA_200';

  if (desc.includes('rsi')) { buySignal = 'RSI_OVERSOLD'; sellSignal = 'RSI_OVERBOUGHT'; }
  if (desc.includes('macd')) { buySignal = 'MACD_CROSSOVER'; sellSignal = 'MACD_CROSSUNDER'; }
  if (desc.includes('breakout')) { buySignal = 'BREAKOUT_HIGH'; sellSignal = 'BREAKOUT_LOW'; }

  const config = {
    strategy,
    tradingMode: 'automatic',
    symbol: market === 'crypto' ? 'BTCUSD' : market === 'indices' ? 'US30' : 'EURUSD',
    timeFrame: tf,
    moneyManagement: {
      riskPerTrade, maxDailyLoss, maxDailyProfit, lotSize,
      martingaleMultiplier: strategy === 'martingale' ? 2.0 : 1.0
    },
    tradeManagement: {
      stopLoss: desc.includes('tight') ? 20 : strategy === 'scalping' ? 15 : 50,
      takeProfit: strategy === 'scalping' ? 30 : 100,
      trailingStop: { enabled: desc.includes('trail'), points: 30 }
    },
    entryRules: {
      buySignal, sellSignal, trendFilter,
      timeframe: tf
    },
    grid: strategy === 'grid' ? {
      gridSize: 20, gridLevels: 10, gridStep: 10
    } : undefined
  };

  const explanation = generateExplanation(desc, strategy, risk);

  return { configuration: config, explanation, strategy };
}

function generateExplanation(desc, strategy, risk) {
  const strategyNames = {
    grid: 'Grid Trading', martingale: 'Martingale', hedging: 'Hedging',
    trend_following: 'Trend Following', scalping: 'Scalping'
  };
  const name = strategyNames[strategy] || 'Custom';
  return `This ${risk} ${name} strategy was generated from your description. ` +
    `It uses ${strategy === 'trend_following' ? 'moving average crossovers for trend direction' :
      strategy === 'grid' ? 'automated buy/sell orders at set intervals' :
      strategy === 'martingale' ? 'progressive lot sizing on losses' :
      strategy === 'hedging' ? 'opposing positions to offset risk' :
      'quick entries with tight stops'} as the core logic. ` +
    `Risk is set to ${risk === 'conservative' ? '0.5%' : risk === 'aggressive' ? '2%' : '1%'} per trade. ` +
    `Review and adjust the parameters in the builder before deploying.`;
}

module.exports = { generateFromDescription };