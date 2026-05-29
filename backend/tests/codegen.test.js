const CodeGenerator = require('../services/codeGenerator');

describe('CodeGenerator', () => {
  const baseConfig = {
    strategy: 'grid',
    symbol: 'EURUSD',
    timeFrame: 'H1',
    moneyManagement: { riskPerTrade: 1.5, maxDailyLoss: 500, maxDailyProfit: 1000, lotSize: 0.1, martingaleMultiplier: 2.0 },
    tradeManagement: { stopLoss: 50, takeProfit: 100, trailingStop: { enabled: true, points: 30 } },
    entryRules: { buySignal: 'MA_CROSSOVER', sellSignal: 'RSI_OVERBOUGHT', trendFilter: 'EMA_200' },
    grid: { gridSize: 20, gridLevels: 10, gridStep: 10 }
  };

  const bot = { name: 'TestBot', configuration: baseConfig };

  test('generate MT4 code', () => {
    const code = CodeGenerator.generate(bot, 'mt4');
    expect(code).toBeDefined();
    expect(code).toContain('.mq4');
    expect(code).toContain('TestBot');
    expect(code).toContain('MagicNumber');
    expect(code).toContain('OnTick');
    expect(code).toContain('OP_BUY');
    expect(code).not.toContain('CTrade');
  });

  test('generate MT5 code', () => {
    const code = CodeGenerator.generate(bot, 'mt5');
    expect(code).toBeDefined();
    expect(code).toContain('.mq5');
    expect(code).toContain('TestBot');
    expect(code).toContain('MagicNumber');
    expect(code).toContain('OnTick');
    expect(code).toContain('CTrade');
    expect(code).toContain('PositionOpen');
  });

  test('MT4 code contains strategy-specific logic', () => {
    const code = CodeGenerator.generate(bot, 'mt4');
    expect(code).toContain('gridLevels');
    expect(code).toContain('Grid Buy');
    expect(code).toContain('Grid Sell');
  });

  test('MT5 code contains strategy-specific logic', () => {
    const code = CodeGenerator.generate(bot, 'mt5');
    expect(code).toContain('Grid Buy');
    expect(code).toContain('Grid Sell');
  });

  test('martingale strategy generates correct code', () => {
    const martingaleBot = {
      name: 'MartingaleBot',
      configuration: { ...baseConfig, strategy: 'martingale' }
    };
    const code = CodeGenerator.generate(martingaleBot, 'mt4');
    expect(code).toContain('Martingale');
    expect(code).toContain('OrderLots() * 2');
  });

  test('hedging strategy generates correct code', () => {
    const hedgeBot = {
      name: 'HedgeBot',
      configuration: { ...baseConfig, strategy: 'hedging' }
    };
    const code = CodeGenerator.generate(hedgeBot, 'mt4');
    expect(code).toContain('Hedge Buy');
    expect(code).toContain('Hedge Sell');
    expect(code).toContain('CountType');
  });

  test('trend strategy generates correct code', () => {
    const trendBot = {
      name: 'TrendBot',
      configuration: { ...baseConfig, strategy: 'trend' }
    };
    const code = CodeGenerator.generate(trendBot, 'mt4');
    expect(code).toContain('Trend Buy');
    expect(code).toContain('Trend Sell');
    expect(code).toContain('iMA');
  });

  test('scalping strategy generates correct code', () => {
    const scalpBot = {
      name: 'ScalpBot',
      configuration: { ...baseConfig, strategy: 'scalping' }
    };
    const code = CodeGenerator.generate(scalpBot, 'mt4');
    expect(code).toContain('Scalp Buy');
    expect(code).toContain('Scalp Sell');
    expect(code).toContain('iRSI');
  });

  test('MT5 hedging uses CTrade API', () => {
    const hedgeBot = {
      name: 'HedgeBot',
      configuration: { ...baseConfig, strategy: 'hedging' }
    };
    const code = CodeGenerator.generate(hedgeBot, 'mt5');
    expect(code).toContain('PositionOpen');
    expect(code).toContain('ORDER_TYPE_BUY');
    expect(code).toContain('ORDER_TYPE_SELL');
  });

  test('code contains daily limit checks', () => {
    const code = CodeGenerator.generate(bot, 'mt4');
    expect(code).toContain('MaxDailyLoss');
    expect(code).toContain('MaxDailyProfit');
    expect(code).toContain('UpdateDailyPL');
  });

  test('code contains trailing stop reference', () => {
    const code = CodeGenerator.generate(bot, 'mt4');
    expect(code).toContain('UseTrailing');
    expect(code).toContain('TrailingPoints');
  });

  test('generated code compiles syntactically (basic check)', () => {
    const code = CodeGenerator.generate(bot, 'mt4');
    // Check for balanced braces (basic syntax check)
    const opens = (code.match(/{/g) || []).length;
    const closes = (code.match(/}/g) || []).length;
    expect(opens).toBe(closes);
  });

  test('MT5 code has balanced braces', () => {
    const code = CodeGenerator.generate(bot, 'mt5');
    const opens = (code.match(/{/g) || []).length;
    const closes = (code.match(/}/g) || []).length;
    expect(opens).toBe(closes);
  });
});
