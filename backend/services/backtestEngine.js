function simulate(config, symbol, timeframe, dateStart, dateEnd) {
  const trades = [];
  const strategy = (config.strategy || 'grid').toLowerCase();
  const mm = config.moneyManagement || {};
  const tm = config.tradeManagement || {};
  const er = config.entryRules || {};
  const riskPerTrade = (mm.riskPerTrade || 1) / 100;
  const lotSize = mm.lotSize || 0.1;
  const stopLoss = tm.stopLoss || 50;
  const takeProfit = tm.takeProfit || 100;

  // Generate synthetic price data using a random walk
  const data = generateOHLC(2880, dateStart); // ~2 months of hourly bars
  let balance = 10000;
  let equity = 10000;
  let openTrade = null;
  const equityCurve = [{ t: data[0].time, v: balance }];

  for (let i = 20; i < data.length; i++) {
    const bar = data[i];
    const prev = data[i - 1];

    if (!openTrade) {
      let signal = false;
      const rsi = calcRSI(data, i, 14);
      const sma20 = calcSMA(data, i, 20);
      const sma50 = calcSMA(data, i, 50);

      if (strategy === 'grid') {
        if (Math.abs(bar.close - prev.close) > (config.grid && config.grid.gridStep || 10) * 0.0001) signal = true;
      } else if (strategy === 'martingale') {
        signal = true;
      } else if (strategy === 'hedging') {
        if (rsi > 70 || rsi < 30) signal = true;
      } else if (strategy === 'trend_following' || strategy === 'trend following') {
        if (sma20 && sma50 && sma20 > sma50) signal = true;
      } else if (strategy === 'scalping') {
        if (Math.abs(bar.close - prev.close) > 0.0005) signal = true;
      } else {
        signal = true;
      }

      if (signal) {
        const direction = bar.close > prev.close ? 'buy' : 'sell';
        const sl = direction === 'buy' ? bar.close - stopLoss * 0.0001 : bar.close + stopLoss * 0.0001;
        const tp = direction === 'buy' ? bar.close + takeProfit * 0.0001 : bar.close - takeProfit * 0.0001;
        const lots = lotSize * (1 + (1 - riskPerTrade));
        openTrade = {
          type: direction, entry_price: bar.close, entry_time: bar.time,
          lots, stop_loss: sl, take_profit: tp
        };
      }
    } else {
      let exited = false;
      let exitPrice = bar.close;
      let exitReason = 'bar_close';
      let profit = 0;

      if (openTrade.type === 'buy') {
        if (bar.low <= openTrade.stop_loss) { exitPrice = openTrade.stop_loss; exitReason = 'stop_loss'; }
        else if (bar.high >= openTrade.take_profit) { exitPrice = openTrade.take_profit; exitReason = 'take_profit'; }
        else if (i === data.length - 1) { exitReason = 'end_of_data'; }
        else { exited = false; }

        if (exitReason !== 'bar_close' || i === data.length - 1) {
          exited = true;
          profit = (exitPrice - openTrade.entry_price) / 0.0001 * openTrade.lots * 10;
        }
      } else {
        if (bar.high >= openTrade.stop_loss) { exitPrice = openTrade.stop_loss; exitReason = 'stop_loss'; }
        else if (bar.low <= openTrade.take_profit) { exitPrice = openTrade.take_profit; exitReason = 'take_profit'; }
        else if (i === data.length - 1) { exitReason = 'end_of_data'; }
        else { exited = false; }

        if (exitReason !== 'bar_close' || i === data.length - 1) {
          exited = true;
          profit = (openTrade.entry_price - exitPrice) / 0.0001 * openTrade.lots * 10;
        }
      }

      if (exited) {
        balance += profit;
        trades.push({
          type: openTrade.type, entry_price: openTrade.entry_price, exit_price: exitPrice,
          entry_time: openTrade.entry_time, exit_time: bar.time,
          lots: openTrade.lots, stop_loss: openTrade.stop_loss, take_profit: openTrade.take_profit,
          profit: Math.round(profit * 100) / 100, pips: Math.round(Math.abs(exitPrice - openTrade.entry_price) / 0.0001 * 10) / 10,
          exit_reason: exitReason
        });
        openTrade = null;
        equityCurve.push({ t: bar.time, v: Math.round(balance * 100) / 100 });
      }
    }
  }

  if (openTrade) {
    equityCurve.push({ t: data[data.length - 1].time, v: Math.round(balance * 100) / 100 });
  }

  const metrics = calcMetrics(trades, balance, 10000);
  return { trades, metrics, equity_curve: equityCurve };
}

function generateOHLC(bars, startDate) {
  const data = [];
  let price = 1.1000;
  const start = new Date(startDate || '2025-01-01');
  for (let i = 0; i < bars; i++) {
    const change = (Math.random() - 0.495) * 0.002;
    price += change;
    const open = price;
    const close = price + (Math.random() - 0.5) * 0.001;
    const high = Math.max(open, close) + Math.random() * 0.0005;
    const low = Math.min(open, close) - Math.random() * 0.0005;
    const time = new Date(start.getTime() + i * 3600000);
    data.push({ time: time.toISOString(), open, high, low, close: Math.max(close, 0.0001) });
  }
  return data;
}

function calcSMA(data, index, period) {
  if (index < period - 1) return null;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[index - i].close;
  return sum / period;
}

function calcRSI(data, index, period) {
  if (index < period) return 50;
  let gains = 0, losses = 0;
  for (let i = index - period + 1; i <= index; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff > 0) gains += diff; else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function calcMetrics(trades, finalBalance, initialBalance) {
  if (trades.length === 0) {
    return { total_trades: 0, win_rate: 0, profit_factor: 0, total_profit: 0,
      max_drawdown: 0, sharpe_ratio: 0, avg_rr: 0, best_trade: 0, worst_trade: 0 };
  }

  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  const profits = trades.map(t => t.profit);
  const totalProfit = profits.reduce((a, b) => a + b, 0);
  const grossWin = wins.reduce((a, t) => a + t.profit, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.profit, 0));
  const winRate = trades.length > 0 ? wins.length / trades.length * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0;
  const avgWin = wins.length > 0 ? grossWin / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const avgRR = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 999 : 0;

  let peak = initialBalance;
  let maxDD = 0;
  let running = initialBalance;
  for (const t of trades) {
    running += t.profit;
    if (running > peak) peak = running;
    const dd = (peak - running) / peak * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const mean = totalProfit / trades.length;
  const variance = trades.reduce((sum, t) => sum + Math.pow(t.profit - mean, 2), 0) / trades.length;
  const stdDev = Math.sqrt(variance);
  const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0;

  return {
    total_trades: trades.length, win_rate: Math.round(winRate * 100) / 100,
    profit_factor: Math.round(profitFactor * 100) / 100,
    total_profit: Math.round(totalProfit * 100) / 100,
    max_drawdown: Math.round(maxDD * 100) / 100,
    sharpe_ratio: Math.round(sharpe * 100) / 100,
    avg_rr: Math.round(avgRR * 100) / 100,
    best_trade: Math.round(Math.max(...profits, 0) * 100) / 100,
    worst_trade: Math.round(Math.min(...profits, 0) * 100) / 100,
    final_balance: Math.round(finalBalance * 100) / 100,
    total_return: Math.round((finalBalance - initialBalance) / initialBalance * 10000) / 100
  };
}

module.exports = { simulate };