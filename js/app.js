const API_BASE = '/api';

let backendOnline = null;

async function checkBackend() {
  try {
    const res = await fetch(`${API_BASE}/health`, { method: 'GET', signal: AbortSignal.timeout(2000) });
    backendOnline = res.ok;
  } catch {
    backendOnline = false;
  }
  return backendOnline;
}

async function fetchAPI(path, method = 'GET', body = null) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new Error('Backend unavailable. Using local storage.');
  }

  if (path.includes('/download')) {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Download failed' }));
      throw new Error(err.error);
    }
    return res;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function isAuthenticated() {
  return !!localStorage.getItem('token');
}

function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'index.html';
}

function showAlert(message, type = 'info', container) {
  const el = document.createElement('div');
  el.className = `alert alert-${type}`;
  el.textContent = message;
  const parent = container || document.querySelector('.builder-main') || document.querySelector('.page-header') || document.body;
  parent.prepend(el);
  setTimeout(() => el.remove(), 4000);
}

function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// localStorage fallback (offline mode)
const Storage = {
  getBots() {
    return JSON.parse(localStorage.getItem('botforge_bots') || '[]');
  },
  saveBots(bots) {
    localStorage.setItem('botforge_bots', JSON.stringify(bots));
  },
  addBot(bot) {
    const bots = this.getBots();
    bot.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    bot.created_at = new Date().toISOString();
    bot.updated_at = bot.created_at;
    bots.push(bot);
    this.saveBots(bots);
    return bot;
  },
  updateBot(id, updates) {
    const bots = this.getBots();
    const idx = bots.findIndex(b => b.id === id);
    if (idx === -1) return null;
    bots[idx] = { ...bots[idx], ...updates, updated_at: new Date().toISOString() };
    this.saveBots(bots);
    return bots[idx];
  },
  deleteBot(id) {
    const bots = this.getBots().filter(b => b.id !== id);
    this.saveBots(bots);
  },
  getBot(id) {
    return this.getBots().find(b => b.id === id) || null;
  },
  getDefaultConfig() {
    return {
      strategy: 'grid',
      tradingMode: 'automatic',
      symbol: 'EURUSD',
      timeFrame: 'H1',
      moneyManagement: { riskPerTrade: 1.0, maxDailyLoss: 500, maxDailyProfit: 1000, lotSize: 0.1, martingaleMultiplier: 2.0 },
      tradeManagement: { stopLoss: 50, takeProfit: 100, trailingStop: { enabled: false, points: 30 } },
      entryRules: { buySignal: 'MA_CROSSOVER', sellSignal: 'RSI_OVERBOUGHT', trendFilter: 'EMA_200' },
      grid: { gridSize: 20, gridLevels: 10, gridStep: 10 }
    };
  }
};

// Online/offline bot operations
async function getBots() {
  if (isAuthenticated() && backendOnline !== false) {
    try { return await fetchAPI('/bots'); } catch (e) { /* fall through */ }
  }
  return Storage.getBots();
}

async function getBot(id) {
  if (isAuthenticated() && backendOnline !== false) {
    try { return await fetchAPI(`/bots/${id}`); } catch (e) { /* fall through */ }
  }
  return Storage.getBot(id);
}

async function createBot(name, description, configuration) {
  if (isAuthenticated() && backendOnline !== false) {
    try { return await fetchAPI('/bots', 'POST', { name, description, configuration }); } catch (e) { /* fall through */ }
  }
  return Storage.addBot({ name, description, configuration });
}

async function updateBot(id, data) {
  if (isAuthenticated() && backendOnline !== false) {
    try { return await fetchAPI(`/bots/${id}`, 'PUT', data); } catch (e) { /* fall through */ }
  }
  return Storage.updateBot(id, data);
}

async function deleteBot(id) {
  if (isAuthenticated() && backendOnline !== false) {
    try { return await fetchAPI(`/bots/${id}`, 'DELETE'); } catch (e) { /* fall through */ }
  }
  Storage.deleteBot(id);
}

async function downloadBotCode(id, platform) {
  if (isAuthenticated() && backendOnline !== false) {
    try {
      const res = await fetchAPI(`/bots/${id}/download?platform=${platform}`, 'GET');
      const text = await res.text();
      const ext = platform === 'mt4' ? 'mq4' : 'mq5';
      const bot = await getBot(id);
      downloadFile(text, `${(bot.name || 'Bot').replace(/\s+/g, '_')}.${ext}`);
      return;
    } catch (e) { /* fall through */ }
  }
  // offline fallback
  const bot = Storage.getBot(id);
  if (!bot) { showAlert('Bot not found', 'error'); return; }
  const generator = platform === 'mt4' ? MQL4 : MQL5;
  const ext = platform === 'mt4' ? 'mq4' : 'mq5';
  const code = generator.generate({ name: bot.name, configuration: bot.configuration });
  downloadFile(code, `${bot.name.replace(/\s+/g, '_')}.${ext}`);
  showAlert(`Downloaded ${bot.name}.${ext}`, 'success');
}

document.addEventListener('DOMContentLoaded', async () => {
  // Check if backend is available (silent)
  checkBackend().then(online => {
    if (!online && isAuthenticated() && !window.location.pathname.includes('login') && !window.location.pathname.includes('register')) {
      console.log('BotForge: Backend offline, using local storage');
    }
  });

  const path = window.location.pathname.split('/').pop() || 'index.html';
  if (path === 'builder.html' || path === 'dashboard.html') {
    if (!requireAuth()) return;
  }
  if (path === 'builder.html' && typeof initBuilder === 'function') initBuilder();
  if (path === 'dashboard.html' && typeof initDashboard === 'function') initDashboard();

  // update nav based on auth state
  const nav = document.querySelector('.nav-links');
  if (nav) {
    if (isAuthenticated()) {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const authLink = document.createElement('a');
      authLink.href = '#';
      authLink.textContent = user.username || 'Account';
      authLink.style.opacity = '0.6';
      const logoutLink = document.createElement('a');
      logoutLink.href = '#';
      logoutLink.textContent = 'Logout';
      logoutLink.addEventListener('click', (e) => { e.preventDefault(); logout(); });
      if (!document.querySelector('.nav-links a[href="login.html"]')) {
        nav.appendChild(authLink);
        nav.appendChild(logoutLink);
      }
    }
  }
});
