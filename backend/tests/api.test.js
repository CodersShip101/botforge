const db = require('../config/database');
const request = require('supertest');
const app = require('../server');

let testToken = '';
let testBotId = null;

beforeAll(async () => {
  await db.init();
  try {
    db.prepare('DELETE FROM downloads').run();
    db.prepare('DELETE FROM bots').run();
    db.prepare("DELETE FROM users WHERE email LIKE 'test-%'").run();
  } catch (e) {
    // table may not exist
  }
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
  test('POST /api/auth/register - creates user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test-user@test.com', username: 'testuser', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('test-user@test.com');
    testToken = res.body.token;
  });

  test('POST /api/auth/register - rejects duplicate', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test-user@test.com', username: 'testuser2', password: 'password123' });
    expect(res.status).toBe(409);
  });

  test('POST /api/auth/register - requires fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test2@test.com' });
    expect(res.status).toBe(400);
  });

  test('POST /api/auth/login - logs in', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test-user@test.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    testToken = res.body.token;
  });

  test('POST /api/auth/login - rejects bad password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test-user@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me - returns user', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('test-user@test.com');
  });

  test('GET /api/auth/me - rejects no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
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
