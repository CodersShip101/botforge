const API_BASE = '/api';
let backendOnline = null;

async function getClerkToken() {
  try {
    if (window.Clerk?.session) {
      return await window.Clerk.session.getToken();
    }
  } catch {}
  return localStorage.getItem('vantis_token') || null;
}

function isAuthenticated() {
  return !!(window.Clerk?.user || localStorage.getItem('vantis_token'));
}

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
  const token = await getClerkToken();
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
    throw new Error('Backend unavailable.');
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

const Storage = {
  getBots() {
    return JSON.parse(localStorage.getItem('vantis_bots') || '[]');
  },
  saveBots(bots) {
    localStorage.setItem('vantis_bots', JSON.stringify(bots));
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

(async function migrateKeys() {
  const oldBots = localStorage.getItem('botforge_bots');
  if (oldBots && !localStorage.getItem('vantis_bots')) {
    localStorage.setItem('vantis_bots', oldBots);
  }
  ['botforge_bots', 'token', 'access_token', 'refresh_token'].forEach(k => localStorage.removeItem(k));
})();

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
}

async function autosaveBot(botId, config) {
  if (isAuthenticated() && backendOnline !== false) {
    try { return await fetchAPI(`/bots/${botId}/autosave`, 'POST', { configuration: config }); } catch (e) { /* silent */ }
  }
}

async function getVersions(botId) {
  if (isAuthenticated() && backendOnline !== false) {
    try { return (await fetchAPI(`/bots/${botId}/versions`)).versions || []; } catch (e) { /* fall through */ }
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

function renderProfileDropdown() {
  if (!window.Clerk?.user) return;
  const navLinks = document.querySelector('.nav-links');
  if (!navLinks || document.getElementById('profile-dropdown')) return;

  const user = window.Clerk.user;
  const name = user.fullName || user.username || user.primaryEmailAddress?.emailAddress?.split('@')[0] || 'User';
  const email = user.primaryEmailAddress?.emailAddress || '';
  const avatarUrl = user.imageUrl || '';
  const initial = (user.fullName || user.username || email || 'U')[0].toUpperCase();

  const dropdownHTML = `
    <div class="profile-dropdown" id="profile-dropdown">
      <button class="profile-trigger" onclick="toggleProfileDropdown()">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="" class="profile-avatar-img">` : `<div class="profile-avatar-letter">${initial}</div>`}
      </button>
      <div class="profile-menu" id="profile-menu">
        <div class="profile-menu-header">
          ${avatarUrl ? `<img src="${avatarUrl}" alt="" class="profile-menu-avatar">` : `<div class="profile-menu-avatar-letter">${initial}</div>`}
          <div class="profile-menu-user">
            <div class="profile-menu-name">${name}</div>
            <div class="profile-menu-email">${email}</div>
          </div>
        </div>
        <div class="profile-menu-plan" id="profile-menu-plan">Free</div>
        <div class="profile-menu-items">
          <a href="account.html" class="profile-menu-item" onclick="closeProfileDropdown()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            My Account</a>
          <a href="account.html?tab=billing" class="profile-menu-item" onclick="closeProfileDropdown()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            Billing & Plan</a>
          <a href="account.html?tab=api-keys" class="profile-menu-item" onclick="closeProfileDropdown()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
            API Keys</a>
          <a href="account.html?tab=devices" class="profile-menu-item" onclick="closeProfileDropdown()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
            My Devices</a>
          <a href="account.html?tab=security" class="profile-menu-item" onclick="closeProfileDropdown()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Security</a>
          <div class="profile-menu-divider"></div>
          <button class="profile-menu-item" onclick="signOut()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out</a>
        </div>
      </div>
    </div>
  `;

  navLinks.insertAdjacentHTML('beforeend', dropdownHTML);

  getPlan().then(p => {
    const planEl = document.getElementById('profile-menu-plan');
    if (planEl && p) planEl.textContent = capitalize(p.plan || 'Free');
  }).catch(() => {});

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#profile-dropdown')) closeProfileDropdown();
  });
}

function toggleProfileDropdown() {
  const menu = document.getElementById('profile-menu');
  if (menu) menu.classList.toggle('show');
}

function closeProfileDropdown() {
  const menu = document.getElementById('profile-menu');
  if (menu) menu.classList.remove('show');
}

function signOut() {
  if (window.Clerk) {
    window.Clerk.signOut();
  }
  localStorage.removeItem('vantis_token');
  localStorage.removeItem('vantis_user');
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', async () => {
  checkBackend().then(online => {
    if (!online && isAuthenticated() && !window.location.pathname.includes('login') && !window.location.pathname.includes('register')) {
      console.log('VANTIS AI: Backend offline, using local storage');
    }
  });

  const path = window.location.pathname.split('/').pop() || 'index.html';
  if (path === 'builder.html' && typeof initBuilder === 'function') initBuilder();
  if (path === 'dashboard.html' && typeof initDashboard === 'function') initDashboard();
});
