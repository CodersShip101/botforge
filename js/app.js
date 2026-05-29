const API_BASE = '/api';

let backendOnline = null;
let refreshPromise = null;

async function checkBackend() {
  try {
    const res = await fetch(`${API_BASE}/health`, { method: 'GET', signal: AbortSignal.timeout(2000) });
    backendOnline = res.ok;
  } catch {
    backendOnline = false;
  }
  return backendOnline;
}

function getAccessToken() {
  return localStorage.getItem('access_token');
}

function getRefreshToken() {
  return localStorage.getItem('refresh_token');
}

function setTokens(accessToken, refreshToken) {
  if (accessToken) localStorage.setItem('access_token', accessToken);
  if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
}

function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: AbortSignal.timeout(10000)
      });

      if (!res.ok) {
        clearTokens();
        return null;
      }

      const data = await res.json();
      setTokens(data.access_token, data.refresh_token);
      return data.access_token;
    } catch {
      clearTokens();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function fetchAPI(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
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
    throw new Error('Backend unavailable.');
  }

  // Try token refresh on 401
  if (res.status === 401 && getRefreshToken()) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000)
      });
    }
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

// Auth helpers
async function signup(email, username, password) {
  const data = await fetchAPI('/auth/signup', 'POST', { email, username, password });
  if (data.access_token) setTokens(data.access_token, data.refresh_token);
  if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

async function signin(email, password) {
  const data = await fetchAPI('/auth/signin', 'POST', { email, password });
  if (data.access_token) setTokens(data.access_token, data.refresh_token);
  if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

async function signout() {
  try {
    const token = getAccessToken();
    if (token) await fetchAPI('/auth/signout', 'POST');
  } catch { /* ignore */ }
  clearTokens();
}

function isAuthenticated() {
  return !!getAccessToken();
}

function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
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
  if (!isoString) return '';
  const d = new Date(isoString.endsWith('Z') ? isoString : isoString + 'Z');
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function capitalize(str) {
  if (!str) return '';
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
  const bot = Storage.getBot(id);
  if (!bot) { showAlert('Bot not found', 'error'); return; }
  const generator = platform === 'mt4' ? MQL4 : MQL5;
  const ext = platform === 'mt4' ? 'mq4' : 'mq5';
  const code = generator.generate({ name: bot.name, configuration: bot.configuration });
  downloadFile(code, `${bot.name.replace(/\s+/g, '_')}.${ext}`);
  showAlert(`Downloaded ${bot.name}.${ext}`, 'success');
}

// New API functions
async function autosaveBot(botId, config) {
  if (isAuthenticated() && backendOnline !== false) {
    try { return await fetchAPI(`/bots/${botId}/autosave`, 'POST', { configuration: config }); } catch (e) { /* silent */ }
  }
}

async function getVersions(botId) {
  if (isAuthenticated() && backendOnline !== false) {
    try { return await fetchAPI(`/bots/${botId}/versions`); } catch (e) { /* fall through */ }
  }
  return [];
}

async function restoreVersion(botId, versionId) {
  if (isAuthenticated() && backendOnline !== false) {
    try { return await fetchAPI(`/bots/${botId}/versions/${versionId}/restore`, 'POST'); } catch (e) { throw e; }
  }
  throw new Error('Backend unavailable');
}

async function generateStrategy(prompt, market, risk) {
  if (isAuthenticated() && backendOnline !== false) {
    try { return await fetchAPI('/ai/strategy/generate', 'POST', { prompt, market, risk }); } catch (e) { throw e; }
  }
  throw new Error('Backend unavailable. AI generation requires server.');
}

async function explainStrategy(config) {
  if (isAuthenticated() && backendOnline !== false) {
    try { return await fetchAPI('/ai/strategy/explain', 'POST', { configuration: config }); } catch (e) { throw e; }
  }
  throw new Error('Backend unavailable');
}

async function runBacktest(botId, config, symbol, timeframe, days) {
  if (isAuthenticated() && backendOnline !== false) {
    try { return await fetchAPI('/backtests', 'POST', { botId, configuration: config, symbol, timeframe, days }); } catch (e) { throw e; }
  }
  throw new Error('Backend unavailable. Backtesting requires server.');
}

async function getBacktests(botId) {
  if (isAuthenticated() && backendOnline !== false) {
    try { return await fetchAPI(`/backtests/bot/${botId}`); } catch (e) { /* fall through */ }
  }
  return [];
}

async function getPlan() {
  if (isAuthenticated() && backendOnline !== false) {
    try { return await fetchAPI('/auth/plan'); } catch (e) { /* fall through */ }
  }
  return null;
}

async function upgradePlan(plan) {
  if (isAuthenticated() && backendOnline !== false) {
    try { return await fetchAPI('/auth/plan/upgrade', 'POST', { plan }); } catch (e) { throw e; }
  }
  throw new Error('Backend unavailable');
}

async function verifyEmail(token) {
  return await fetchAPI('/auth/verify-email/confirm', 'POST', { token });
}

async function resendVerification(email) {
  return await fetchAPI('/auth/verify-email/request', 'POST', { email });
}

document.addEventListener('DOMContentLoaded', async () => {
  checkBackend().then(online => {
    if (!online && isAuthenticated() && !window.location.pathname.includes('login') && !window.location.pathname.includes('register')) {
      console.log('VANTIS AI: Backend offline, using local storage');
    }
  });

  const path = window.location.pathname.split('/').pop() || 'index.html';
  if (path === 'builder.html' || path === 'dashboard.html') {
    if (!requireAuth()) return;
  }
  if (path === 'builder.html' && typeof initBuilder === 'function') initBuilder();
  if (path === 'dashboard.html' && typeof initDashboard === 'function') initDashboard();

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
      logoutLink.addEventListener('click', async (e) => {
        e.preventDefault();
        await signout();
        window.location.href = 'index.html';
      });
      if (!document.querySelector('.nav-links a[href="login.html"]')) {
        nav.appendChild(authLink);
        nav.appendChild(logoutLink);
      }
    }
  }
});