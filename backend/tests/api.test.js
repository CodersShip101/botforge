const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const request = require('supertest');

const app = require('../server');

let testToken = null;
let testBotId = null;
const testEmail = `test-${Date.now()}@test.com`;

beforeAll(async () => {
  const dbPath = path.join(__dirname, '..', 'data', 'botforge.db');
  try { fs.unlinkSync(dbPath); } catch (e) {}
  try { fs.unlinkSync(dbPath + '-wal'); } catch (e) {}
  try { fs.unlinkSync(dbPath + '-shm'); } catch (e) {}
  await db.init();
  try {
    db.prepare('DELETE FROM downloads').run();
    db.prepare('DELETE FROM bots').run();
    db.prepare("DELETE FROM users WHERE email LIKE 'test-%'").run();
  } catch (e) {}
});

afterAll(() => {
  try {
    db.prepare('DELETE FROM downloads').run();
    db.prepare('DELETE FROM bots').run();
    db.prepare("DELETE FROM users WHERE email LIKE 'test-%'").run();
  } catch (e) {}
  db.close();
});

describe('Auth API', () => {
  test('POST /api/auth/register - creates account', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail, username: 'testuser', password: 'testpass123', confirmPassword: 'testpass123' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(testEmail);
    expect(res.body.token).toBeDefined();
    testToken = res.body.token;
  });

  test('POST /api/auth/register - rejects duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail, username: 'testuser2', password: 'testpass123', confirmPassword: 'testpass123' });
    expect(res.status).toBe(400);
  });

  test('POST /api/auth/login - logs in with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'testpass123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(testEmail);
    testToken = res.body.token;
  });

  test('POST /api/auth/login - rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me - returns current user', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(testEmail);
  });

  test('GET /api/auth/me - rejects without auth', async () => {
    const res = await request(app)
      .get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/plan - returns plan', async () => {
    const res = await request(app)
      .get('/api/auth/plan')
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(200);
    expect(res.body.plan).toBeDefined();
    expect(res.body.limits).toBeDefined();
  });

  test('POST /api/auth/plan/upgrade - upgrades plan', async () => {
    const res = await request(app)
      .post('/api/auth/plan/upgrade')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ plan: 'pro' });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('pro');
  });

  test('GET /api/auth/plan - reflects upgraded plan', async () => {
    const res = await request(app)
      .get('/api/auth/plan')
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('pro');
  });
});

describe('Bot API', () => {
  test('POST /api/bots - creates bot', async () => {
    const config = {
      strategy: 'grid',
      symbol: 'EURUSD',
      timeFrame: 'H1',
      moneyManagement: { riskPerTrade: 1, maxDailyLoss: 500, maxDailyProfit: 1000, lotSize: 0.1, martingaleMultiplier: 2 },
      tradeManagement: { stopLoss: 50, takeProfit: 100, trailingStop: { enabled: false, points: 30 } },
      entryRules: { buySignal: 'MA_CROSSOVER', sellSignal: 'RSI_OVERBOUGHT', trendFilter: 'EMA_200' },
      grid: { gridSize: 20, gridLevels: 10, gridStep: 10 }
    };
    const res = await request(app)
      .post('/api/bots')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'Test Grid Bot', description: 'A test bot', configuration: config });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Grid Bot');
    expect(res.body.configuration.strategy).toBe('grid');
    testBotId = res.body.id;
  });

  test('POST /api/bots - rejects without name', async () => {
    const res = await request(app)
      .post('/api/bots')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ configuration: {} });
    expect(res.status).toBe(400);
  });

  test('POST /api/bots - rejects without auth', async () => {
    const res = await request(app)
      .post('/api/bots')
      .send({ name: 'No Auth Bot', configuration: {} });
    expect(res.status).toBe(401);
  });

  test('GET /api/bots - lists user bots', async () => {
    const res = await request(app)
      .get('/api/bots')
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/bots/:id - gets single bot', async () => {
    const res = await request(app)
      .get(`/api/bots/${testBotId}`)
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testBotId);
  });

  test('PUT /api/bots/:id - updates bot', async () => {
    const res = await request(app)
      .put(`/api/bots/${testBotId}`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'Updated Grid Bot', description: 'Updated', configuration: { strategy: 'grid', moneyManagement: {}, tradeManagement: {}, entryRules: {}, grid: {} } });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Grid Bot');
  });

  test('GET /api/bots/:id/download - downloads MT4 code', async () => {
    const res = await request(app)
      .get(`/api/bots/${testBotId}/download?platform=mt4`)
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('.mq4');
    expect(res.text).toContain('Updated Grid Bot');
  });

  test('GET /api/bots/:id/download - downloads MT5 code', async () => {
    const res = await request(app)
      .get(`/api/bots/${testBotId}/download?platform=mt5`)
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('.mq5');
    expect(res.text).toContain('CTrade');
  });

  test('GET /api/bots/:id/download - rejects bad platform', async () => {
    const res = await request(app)
      .get(`/api/bots/${testBotId}/download?platform=mt3`)
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(400);
  });

  test('DELETE /api/bots/:id - deletes bot', async () => {
    const res = await request(app)
      .delete(`/api/bots/${testBotId}`)
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/bots/:id - returns 404 after delete', async () => {
    const res = await request(app)
      .get(`/api/bots/${testBotId}`)
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(404);
  });

  test('GET /api/health - health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
