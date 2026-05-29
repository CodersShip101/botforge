let builderState = {
  step: 0,
  platform: 'mt4',
  config: Storage.getDefaultConfig(),
  name: '',
  description: '',
  editingId: null
};

const STEPS = [
  { id: 'basics', title: 'Bot Name' },
  { id: 'strategy', title: 'Strategy' },
  { id: 'money-mgmt', title: 'Money Management' },
  { id: 'trade-mgmt', title: 'Trade Management' },
  { id: 'entry-rules', title: 'Entry Rules' },
  { id: 'preview', title: 'Preview & Download' }
];

async function initBuilder() {
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  if (editId) {
    const bot = await getBot(editId);
    if (bot) {
      builderState.editingId = editId;
      builderState.name = bot.name;
      builderState.description = bot.description || '';
      builderState.config = bot.configuration;
    }
  }
  renderSidebar();
  renderStep(0);
  setupPlatformToggle();
}

function renderSidebar() {
  const sidebar = document.getElementById('sidebar-steps');
  if (!sidebar) return;
  sidebar.innerHTML = STEPS.map((s, i) => {
    const cls = i === builderState.step ? 'active' : i < builderState.step ? 'completed' : '';
    return `<div class="sidebar-step ${cls}" data-step="${i}">
      <span class="step-indicator">${i < builderState.step ? '✓' : i + 1}</span>
      ${s.title}
    </div>`;
  }).join('');

  sidebar.querySelectorAll('.sidebar-step').forEach(el => {
    el.addEventListener('click', () => {
      const s = parseInt(el.dataset.step);
      if (s <= builderState.step + 1) renderStep(s);
    });
  });
}

function renderStep(step) {
  builderState.step = step;
  renderSidebar();
  const steps = [renderBasics, renderStrategy, renderMoneyMgmt, renderTradeMgmt, renderEntryRules, renderPreview];
  steps[step]();
}

function setupPlatformToggle() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-platform]');
    if (btn && btn.closest('.platform-toggle')) {
      const toggle = btn.closest('.platform-toggle');
      toggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      builderState.platform = btn.dataset.platform;
      if (builderState.step === 5) renderPreview();
    }
  });
}

function collectFormData() {
  const nameEl = document.getElementById('botName');
  const descEl = document.getElementById('botDescription');
  if (nameEl) builderState.name = nameEl.value;
  if (descEl) builderState.description = descEl.value;

  document.querySelectorAll('[name]').forEach(input => {
    const name = input.getAttribute('name');
    if (name && name.startsWith('config.')) {
      const path = name.replace('config.', '').split('.');
      let obj = builderState.config;
      for (let i = 0; i < path.length - 1; i++) {
        if (!obj[path[i]]) obj[path[i]] = {};
        obj = obj[path[i]];
      }
      obj[path[path.length - 1]] = input.type === 'number' || input.type === 'range'
        ? parseFloat(input.value) : input.value;
    }
  });
}

function renderBasics() {
  const main = document.getElementById('step-content');
  if (!main) return;
  main.innerHTML = `
    <h2>Name Your Bot</h2>
    <p class="step-desc">Give your trading bot a name and optional description.</p>
    <div class="form-group">
      <label for="botName">Bot Name</label>
      <input type="text" id="botName" value="${builderState.name.replace(/"/g, '&quot;')}" placeholder="e.g. My Grid Bot">
    </div>
    <div class="form-group">
      <label for="botDescription">Description (optional)</label>
      <textarea id="botDescription" placeholder="Describe your bot's strategy...">${builderState.description.replace(/"/g, '&quot;')}</textarea>
    </div>
    <div class="form-actions">
      <span></span>
      <button class="btn btn-primary btn-md" onclick="nextStep()">Next</button>
    </div>
  `;
}

function renderStrategy() {
  const strategies = [
    { id: 'grid', label: 'Grid Trading', desc: 'Place orders at predefined intervals' },
    { id: 'martingale', label: 'Martingale', desc: 'Double down on losses' },
    { id: 'hedging', label: 'Hedging', desc: 'Offset risk with opposing positions' },
    { id: 'trend', label: 'Trend Following', desc: 'Trade with momentum' },
    { id: 'scalping', label: 'Scalping', desc: 'Quick entries for small profits' }
  ];

  const selected = builderState.config.strategy;
  const main = document.getElementById('step-content');
  if (!main) return;

  main.innerHTML = `
    <h2>Choose Strategy</h2>
    <p class="step-desc">Select the core strategy for your trading bot.</p>
    <div class="form-group">
      <label>Strategy Type</label>
      <div class="toggle-group" id="strategy-toggles">
        ${strategies.map(s =>
          `<button class="toggle-btn ${selected === s.id ? 'selected' : ''}" data-value="${s.id}">${s.label}</button>`
        ).join('')}
      </div>
      <p class="hint" id="strategy-desc">${strategies.find(s => s.id === selected)?.desc || ''}</p>
    </div>
    <div class="form-group">
      <label for="config.symbol">Trading Symbol</label>
      <select id="config.symbol" onchange="updateConfig('symbol', this.value)">
        ${['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','BTCUSD','ETHUSD'].map(s =>
          `<option value="${s}" ${builderState.config.symbol === s ? 'selected' : ''}>${s}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Trading Mode</label>
      <div class="toggle-group">
        <button class="toggle-btn ${builderState.config.tradingMode === 'automatic' ? 'selected' : ''}" onclick="updateConfig('tradingMode','automatic');renderStrategy()">Automatic</button>
        <button class="toggle-btn ${builderState.config.tradingMode === 'manual' ? 'selected' : ''}" onclick="updateConfig('tradingMode','manual');renderStrategy()">Manual Signals</button>
      </div>
    </div>
    ${builderState.config.strategy === 'grid' ? `
    <div class="form-row">
      <div class="form-group">
        <label for="config.grid.gridSize">Grid Size (pips)</label>
        <input type="number" id="config.grid.gridSize" value="${builderState.config.grid.gridSize}" min="1" onchange="updateConfig('grid.gridSize', parseFloat(this.value)||10)">
      </div>
      <div class="form-group">
        <label for="config.grid.gridLevels">Grid Levels</label>
        <input type="number" id="config.grid.gridLevels" value="${builderState.config.grid.gridLevels}" min="1" max="50" onchange="updateConfig('grid.gridLevels', parseInt(this.value)||10)">
      </div>
    </div>
    <div class="form-group">
      <label for="config.grid.gridStep">Step (points)</label>
      <input type="number" id="config.grid.gridStep" value="${builderState.config.grid.gridStep}" min="1" onchange="updateConfig('grid.gridStep', parseFloat(this.value)||10)">
    </div>` : ''}
    ${builderState.config.strategy === 'martingale' ? `
    <div class="form-group">
      <label for="config.martingaleMultiplier">Martingale Multiplier</label>
      <input type="number" id="config.martingaleMultiplier" value="${builderState.config.moneyManagement.martingaleMultiplier}" min="1.1" max="10" step="0.1" onchange="updateConfig('moneyManagement.martingaleMultiplier', parseFloat(this.value)||2)">
      <p class="hint">Multiply lot size by this factor after each loss.</p>
    </div>` : ''}

    <div class="form-actions">
      <button class="btn btn-outline btn-md" onclick="prevStep()">Previous</button>
      <button class="btn btn-primary btn-md" onclick="nextStep()">Next</button>
    </div>
  `;

  document.getElementById('strategy-toggles')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    builderState.config.strategy = btn.dataset.value;
    document.getElementById('strategy-desc').textContent = strategies.find(s => s.id === btn.dataset.value)?.desc || '';
    renderStrategy();
  });
}

function updateConfig(path, value) {
  const parts = path.split('.');
  let obj = builderState.config;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]]) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
}

function renderMoneyMgmt() {
  const mm = builderState.config.moneyManagement;
  const main = document.getElementById('step-content');
  if (!main) return;
  main.innerHTML = `
    <h2>Money Management</h2>
    <p class="step-desc">Define risk parameters and position sizing.</p>
    <div class="form-row">
      <div class="form-group">
        <label>Risk Per Trade (%)</label>
        <input type="number" value="${mm.riskPerTrade}" min="0.1" max="10" step="0.1" onchange="updateConfig('moneyManagement.riskPerTrade', parseFloat(this.value)||1)">
      </div>
      <div class="form-group">
        <label>Fixed Lot Size</label>
        <input type="number" value="${mm.lotSize}" min="0.01" max="100" step="0.01" onchange="updateConfig('moneyManagement.lotSize', parseFloat(this.value)||0.1)">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Max Daily Loss ($)</label>
        <input type="number" value="${mm.maxDailyLoss}" min="0" onchange="updateConfig('moneyManagement.maxDailyLoss', parseFloat(this.value)||500)">
      </div>
      <div class="form-group">
        <label>Max Daily Profit ($)</label>
        <input type="number" value="${mm.maxDailyProfit}" min="0" onchange="updateConfig('moneyManagement.maxDailyProfit', parseFloat(this.value)||1000)">
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-outline btn-md" onclick="prevStep()">Previous</button>
      <button class="btn btn-primary btn-md" onclick="nextStep()">Next</button>
    </div>
  `;
}

function renderTradeMgmt() {
  const tm = builderState.config.tradeManagement;
  const main = document.getElementById('step-content');
  if (!main) return;
  main.innerHTML = `
    <h2>Trade Management</h2>
    <p class="step-desc">Configure stop loss, take profit, and trailing settings.</p>
    <div class="form-row">
      <div class="form-group">
        <label>Stop Loss (points)</label>
        <input type="number" value="${tm.stopLoss}" min="1" onchange="updateConfig('tradeManagement.stopLoss', parseFloat(this.value)||50)">
      </div>
      <div class="form-group">
        <label>Take Profit (points)</label>
        <input type="number" value="${tm.takeProfit}" min="1" onchange="updateConfig('tradeManagement.takeProfit', parseFloat(this.value)||100)">
      </div>
    </div>
    <div class="form-group">
      <label><input type="checkbox" ${tm.trailingStop.enabled ? 'checked' : ''} style="width:auto;margin-right:8px" onchange="updateConfig('tradeManagement.trailingStop.enabled', this.checked);document.getElementById('trailing-points-group').style.display=this.checked?'':'none'"> Enable Trailing Stop</label>
    </div>
    <div class="form-group" id="trailing-points-group" style="${tm.trailingStop.enabled ? '' : 'display:none'}">
      <label>Trailing Distance (points)</label>
      <input type="number" value="${tm.trailingStop.points}" min="1" onchange="updateConfig('tradeManagement.trailingStop.points', parseFloat(this.value)||30)">
    </div>
    <div class="form-actions">
      <button class="btn btn-outline btn-md" onclick="prevStep()">Previous</button>
      <button class="btn btn-primary btn-md" onclick="nextStep()">Next</button>
    </div>
  `;
}

function renderEntryRules() {
  const er = builderState.config.entryRules;
  const main = document.getElementById('step-content');
  if (!main) return;
  main.innerHTML = `
    <h2>Entry Rules</h2>
    <p class="step-desc">Define when your bot enters trades.</p>
    <div class="form-group">
      <label>Buy Signal</label>
      <select onchange="updateConfig('entryRules.buySignal', this.value)">
        <option value="MA_CROSSOVER" ${er.buySignal === 'MA_CROSSOVER' ? 'selected' : ''}>MA Crossover</option>
        <option value="RSI_OVERSOLD" ${er.buySignal === 'RSI_OVERSOLD' ? 'selected' : ''}>RSI Oversold</option>
        <option value="PRICE_BREAKOUT" ${er.buySignal === 'PRICE_BREAKOUT' ? 'selected' : ''}>Price Breakout</option>
        <option value="ALWAYS" ${er.buySignal === 'ALWAYS' ? 'selected' : ''}>Always</option>
      </select>
    </div>
    <div class="form-group">
      <label>Sell Signal</label>
      <select onchange="updateConfig('entryRules.sellSignal', this.value)">
        <option value="RSI_OVERBOUGHT" ${er.sellSignal === 'RSI_OVERBOUGHT' ? 'selected' : ''}>RSI Overbought</option>
        <option value="MA_CROSSOVER" ${er.sellSignal === 'MA_CROSSOVER' ? 'selected' : ''}>MA Crossover</option>
        <option value="PRICE_BREAKOUT" ${er.sellSignal === 'PRICE_BREAKOUT' ? 'selected' : ''}>Price Breakout</option>
        <option value="ALWAYS" ${er.sellSignal === 'ALWAYS' ? 'selected' : ''}>Always</option>
      </select>
    </div>
    <div class="form-group">
      <label>Trend Filter</label>
      <select onchange="updateConfig('entryRules.trendFilter', this.value)">
        <option value="EMA_200" ${er.trendFilter === 'EMA_200' ? 'selected' : ''}>EMA 200</option>
        <option value="EMA_50" ${er.trendFilter === 'EMA_50' ? 'selected' : ''}>EMA 50</option>
        <option value="NONE" ${er.trendFilter === 'NONE' ? 'selected' : ''}>No Filter</option>
      </select>
    </div>
    <div class="form-group">
      <label>Time Frame</label>
      <select onchange="updateConfig('timeFrame', this.value)">
        ${['M1','M5','M15','M30','H1','H4','D1'].map(tf =>
          `<option value="${tf}" ${builderState.config.timeFrame === tf ? 'selected' : ''}>${tf}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-actions">
      <button class="btn btn-outline btn-md" onclick="prevStep()">Previous</button>
      <button class="btn btn-primary btn-md" onclick="nextStep()">Next</button>
    </div>
  `;
}

function renderPreview() {
  collectFormData();
  const platform = builderState.platform;
  const c = builderState.config;
  const ext = platform === 'mt4' ? 'mq4' : 'mq5';

  const generator = platform === 'mt4' ? MQL4 : MQL5;
  const botData = { name: builderState.name || 'MyBot', configuration: c };
  const code = generator.generate(botData);

  const main = document.getElementById('step-content');
  if (!main) return;

  main.innerHTML = `
    <h2>Preview &amp; Download</h2>
    <p class="step-desc">Review your bot configuration and download the generated code.</p>

    <div class="platform-toggle">
      <button class="${platform === 'mt4' ? 'active' : ''}" data-platform="mt4">MT4 (.mq4)</button>
      <button class="${platform === 'mt5' ? 'active' : ''}" data-platform="mt5">MT5 (.mq5)</button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.9rem;margin:16px 0;color:var(--text-muted)">
      <div><strong>Strategy:</strong> ${capitalize(c.strategy)}</div>
      <div><strong>Symbol:</strong> ${c.symbol}</div>
      <div><strong>Timeframe:</strong> ${c.timeFrame}</div>
      <div><strong>Risk/Trade:</strong> ${c.moneyManagement.riskPerTrade}%</div>
      <div><strong>Stop Loss:</strong> ${c.tradeManagement.stopLoss}</div>
      <div><strong>Take Profit:</strong> ${c.tradeManagement.takeProfit}</div>
      <div><strong>Lot Size:</strong> ${c.moneyManagement.lotSize}</div>
      <div><strong>Max Daily Loss:</strong> $${c.moneyManagement.maxDailyLoss}</div>
    </div>

    <div class="preview-section">
      <h3>Generated Code (${ext.toUpperCase()})</h3>
      <div class="preview-box" id="code-preview">${code.slice(0, 3000)}${code.length > 3000 ? '\n/* ... truncated ... */' : ''}</div>
    </div>

    <div class="form-actions">
      <button class="btn btn-outline btn-md" onclick="prevStep()">Previous</button>
      <div style="display:flex;gap:8px">
        <button class="btn btn-success btn-md" onclick="saveAndDownload()">Save &amp; Download</button>
      </div>
    </div>
  `;
}

function nextStep() {
  if (builderState.step < STEPS.length - 1) renderStep(builderState.step + 1);
}

function prevStep() {
  if (builderState.step > 0) renderStep(builderState.step - 1);
}

async function saveAndDownload() {
  collectFormData();
  if (!builderState.name.trim()) {
    showAlert('Please give your bot a name.', 'error');
    return;
  }
  try {
    let bot;
    if (builderState.editingId) {
      bot = await updateBot(builderState.editingId, { name: builderState.name, description: builderState.description, configuration: builderState.config });
    } else {
      bot = await createBot(builderState.name, builderState.description, builderState.config);
    }

    const ext = builderState.platform === 'mt4' ? 'mq4' : 'mq5';
    const generator = builderState.platform === 'mt4' ? MQL4 : MQL5;
    const code = generator.generate({ name: bot.name || builderState.name, configuration: builderState.config });
    downloadFile(code, `${(bot.name || builderState.name).replace(/\s+/g, '_')}.${ext}`);
    showAlert(`Saved and downloaded as .${ext}!`, 'success');
  } catch (err) {
    showAlert('Error: ' + err.message, 'error');
  }
}
