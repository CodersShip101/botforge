function detectStrategy(desc) {
  if (desc.includes('grid')) return 'grid';
  if (desc.includes('martin') || desc.includes('double')) return 'martingale';
  if (desc.includes('hedge')) return 'hedging';
  if (desc.includes('trend') || desc.includes('momentum') || desc.includes('ma') || desc.includes('moving average') || desc.includes('crossover') || desc.includes('ema')) return 'trend_following';
  if (desc.includes('scalp') || desc.includes('quick') || desc.includes('fast')) return 'scalping';
  if (desc.includes('breakout') || desc.includes('break out') || desc.includes('range')) return 'grid';
  if (desc.includes('mean') || desc.includes('reversal') || desc.includes('rsi') || desc.includes('bollinger')) return 'hedging';
  return 'trend_following';
}

function generateConfig(desc, strategy, symbol, tf, riskProfile) {
  const risk = riskProfile || 'moderate';
  let riskPerTrade = 1.0, maxDailyLoss = 500, lotSize = 0.1;
  if (risk === 'conservative') { riskPerTrade = 0.5; maxDailyLoss = 200; lotSize = 0.05; }
  else if (risk === 'aggressive') { riskPerTrade = 2.0; maxDailyLoss = 1000; lotSize = 0.2; }

  let buySignal = 'MA_CROSSOVER', sellSignal = 'RSI_OVERBOUGHT', trendFilter = 'EMA_200';
  if (desc.includes('rsi')) { buySignal = 'RSI_OVERSOLD'; sellSignal = 'RSI_OVERBOUGHT'; }
  if (desc.includes('macd')) { buySignal = 'MACD_CROSSOVER'; sellSignal = 'MACD_CROSSUNDER'; }
  if (desc.includes('breakout')) { buySignal = 'BREAKOUT_HIGH'; sellSignal = 'BREAKOUT_LOW'; }

  const stopLoss = desc.includes('tight') ? 20 : strategy === 'scalping' ? 15 : 50;
  const takeProfit = strategy === 'scalping' ? 30 : 100;

  return {
    strategy,
    tradingMode: 'automatic',
    symbol,
    timeFrame: tf,
    moneyManagement: {
      riskPerTrade, maxDailyLoss, maxDailyProfit: maxDailyLoss * 2, lotSize,
      martingaleMultiplier: strategy === 'martingale' ? 2.0 : 1.0
    },
    tradeManagement: {
      stopLoss, takeProfit,
      trailingStop: { enabled: desc.includes('trail'), points: 30 }
    },
    entryRules: { buySignal, sellSignal, trendFilter, timeframe: tf },
    grid: strategy === 'grid' ? { gridSize: 20, gridLevels: 10, gridStep: 10 } : undefined
  };
}

function generateSummary(desc, strategy, symbol, tf, riskPerTrade) {
  const names = { grid: 'Grid Trading', martingale: 'Martingale', hedging: 'Hedging', trend_following: 'Trend Following', scalping: 'Scalping' };
  return `This ${names[strategy] || 'Custom'} bot trades ${symbol} on ${tf}. ` +
    `It uses ${strategy === 'trend_following' ? 'moving average crossovers to identify trend direction' :
      strategy === 'grid' ? 'automated buy/sell orders at set intervals to capture range-bound movements' :
      strategy === 'martingale' ? 'progressive position sizing that doubles on losses' :
      strategy === 'hedging' ? 'opposing positions to offset directional risk' :
      'quick entries with tight profit targets'} as its core logic, ` +
    `risking ${riskPerTrade}% per trade. Suitable for ${riskPerTrade <= 0.5 ? 'conservative' : riskPerTrade >= 2 ? 'aggressive' : 'moderate'} risk profiles.`;
}

function generateRationale(strategy, desc) {
  const items = [];
  if (strategy === 'trend_following') {
    items.push('EMA crossovers filter out noise and capture sustained moves');
    items.push('Multiple timeframe analysis confirms trend direction');
    items.push('ATR-based position sizing adapts to market volatility');
  } else if (strategy === 'grid') {
    items.push('Grid levels create consistent entries and exits in ranging markets');
    items.push('Fixed spacing reduces emotional decision-making');
    items.push('Multiple levels diversify entry prices');
  } else if (strategy === 'scalping') {
    items.push('Tight stops minimize risk per individual trade');
    items.push('Quick exits compound small gains over many trades');
    items.push('High-frequency approach on low timeframes captures micro-moves');
  } else if (strategy === 'martingale') {
    items.push('Doubling down on losing positions can recover losses quickly');
    items.push('Works best in trending markets with strong reversals');
  } else {
    items.push('Hedging opposite positions reduces directional exposure');
    items.push('RSI-based timing identifies overbought/oversold extremes');
    items.push('Mean reversion profits from price returning to equilibrium');
  }
  if (desc.includes('rsi')) items.push('RSI avoids entering in overextended conditions');
  if (desc.includes('trail')) items.push('Trailing stop locks in profits as price moves favorably');
  return items;
}

function generateProsCons(strategy) {
  const pros = {
    grid: ['Works well in ranging markets', 'Automated consistent entries', 'No need to predict direction'],
    martingale: ['Can recover from losing streaks', 'Simple to implement', 'Works in trending markets'],
    hedging: ['Reduces directional risk', 'Profits from volatility', 'Lower drawdown potential'],
    trend_following: ['Captures large sustained moves', 'Backed by decades of research', 'Works across all timeframes'],
    scalping: ['Quick results', 'Small profit targets are hit frequently', 'Minimal overnight exposure']
  };
  const cons = {
    grid: ['Poor in strongly trending markets', 'Requires significant capital', 'Limited profit potential'],
    martingale: ['Extreme risk during long losing streaks', 'Requires deep pockets', 'Can blow account quickly'],
    hedging: ['Limits upside potential', 'Higher commission costs', 'Complex to manage'],
    trend_following: ['Late entries reduce profit', 'Large drawdowns in choppy markets', 'Long periods of inactivity'],
    scalping: ['High commission costs eat profits', 'Requires constant monitoring', 'Sensitive to spread widening']
  };
  return {
    pros: pros[strategy] || ['Simple to understand and configure', 'Automated execution removes emotion'],
    cons: cons[strategy] || ['Past performance does not guarantee future results', 'Requires proper risk management']
  };
}

function calcAccuracy(strategy, desc, symbol) {
  let score = 0.65;
  if (desc.length > 20) score += 0.05;
  if (desc.includes('stop') || desc.includes('sl') || desc.includes('risk')) score += 0.05;
  if (desc.includes('tp') || desc.includes('take') || desc.includes('target')) score += 0.05;
  if (desc.includes('timeframe') || desc.includes('tf') || desc.includes('h1') || desc.includes('m15')) score += 0.05;
  if (['EURUSD','GBPUSD','USDJPY'].includes(symbol)) score += 0.05;
  if (strategy !== 'grid') score += 0.03;
  return Math.min(score, 0.95);
}

function generateFromPrompt(prompt, market, riskProfile) {
  const desc = (prompt || '').toLowerCase();
  const strategy = detectStrategy(desc);
  const symbol = market === 'crypto' ? 'BTCUSD' : market === 'indices' ? 'US30' : 'EURUSD';
  const tf = desc.includes('m1') ? 'M1' : desc.includes('m5') ? 'M5' :
    desc.includes('m15') ? 'M15' : desc.includes('m30') ? 'M30' :
    desc.includes('h4') ? 'H4' : desc.includes('d1') ? 'D1' : 'H1';

  const risk = riskProfile === 'low' ? 'conservative' : riskProfile === 'high' ? 'aggressive' : 'moderate';
  const config = generateConfig(desc, strategy, symbol, tf, risk);
  const riskPerTrade = config.moneyManagement.riskPerTrade;
  const summary = generateSummary(desc, strategy, symbol, tf, riskPerTrade);
  const rationale = generateRationale(strategy, desc);
  const { pros, cons } = generateProsCons(strategy);
  const accuracy = calcAccuracy(strategy, desc, symbol);

  return {
    config,
    summary,
    rationale,
    pros,
    cons,
    suggestedRisk: {
      risk_per_trade_percent: riskPerTrade,
      max_daily_loss_percent: riskPerTrade * 4,
      max_open_trades: strategy === 'scalping' ? 3 : strategy === 'grid' ? 6 : 2
    },
    accuracy,
    market,
    riskProfile: risk
  };
}

module.exports = { generateFromPrompt, detectStrategy };
