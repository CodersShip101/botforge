const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'botforge.db');

let sqlDb = null;

async function init() {
  const SQL = await initSqlJs();

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(buffer);
  } else {
    sqlDb = new SQL.Database();
  }

  sqlDb.run('PRAGMA foreign_keys = ON');

  sqlDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      configuration TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_bots_user_id ON bots(user_id);

    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT NOT NULL DEFAULT 'mt4',
      downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_downloads_bot_id ON downloads(bot_id);

    CREATE TABLE IF NOT EXISTS bot_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      configuration TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_bot_versions_bot_id ON bot_versions(bot_id);

    CREATE TABLE IF NOT EXISTS backtests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      version INTEGER,
      symbol TEXT NOT NULL DEFAULT 'EURUSD',
      timeframe TEXT NOT NULL DEFAULT 'H1',
      date_start TEXT NOT NULL,
      date_end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      progress REAL DEFAULT 0,
      metrics TEXT DEFAULT '{}',
      trade_count INTEGER DEFAULT 0,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_backtests_user_id ON backtests(user_id);
    CREATE INDEX IF NOT EXISTS idx_backtests_bot_id ON backtests(bot_id);

    CREATE TABLE IF NOT EXISTS backtest_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backtest_id INTEGER NOT NULL REFERENCES backtests(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      entry_price REAL NOT NULL,
      exit_price REAL,
      entry_time DATETIME NOT NULL,
      exit_time DATETIME,
      lots REAL NOT NULL,
      stop_loss REAL,
      take_profit REAL,
      profit REAL,
      pips REAL,
      exit_reason TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_backtest_trades_backtest_id ON backtest_trades(backtest_id);
  `);

  // Add plan column to users if missing
  try {
    sqlDb.run("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'");
  } catch (e) { /* column already exists */ }
  try {
    sqlDb.run("ALTER TABLE users ADD COLUMN plan_updated_at DATETIME");
  } catch (e) { /* column already exists */ }
  try {
    sqlDb.run("ALTER TABLE bots ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'");
  } catch (e) { /* column already exists */ }
  try {
    sqlDb.run("ALTER TABLE users ADD COLUMN reset_token TEXT");
  } catch (e) { /* column already exists */ }
  try {
    sqlDb.run("ALTER TABLE users ADD COLUMN reset_token_expires DATETIME");
  } catch (e) { /* column already exists */ }
}

function save() {
  if (!sqlDb) return;
  const data = sqlDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

const db = {
  init,

  prepare(sql) {
    if (!sqlDb) throw new Error('Database not initialized. Call db.init() first.');

    const stmt = sqlDb.prepare(sql);

    const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(sql);

    return {
      run(...params) {
        if (isWrite) {
          if (params.length > 0) {
            sqlDb.run(sql, params);
          } else {
            sqlDb.run(sql);
          }
          const changes = sqlDb.getRowsModified();
          const ridStmt = sqlDb.prepare('SELECT last_insert_rowid() AS rid');
          let lastInsertRowid;
          if (ridStmt.step()) {
            lastInsertRowid = ridStmt.getAsObject().rid;
          }
          ridStmt.free();
          save();
          return { changes, lastInsertRowid };
        }

        if (params.length > 0) stmt.bind(params);
        const rowPresent = stmt.step();
        stmt.free();
        return { changes: rowPresent ? 0 : 0, lastInsertRowid: 0 };
      },

      get(...params) {
        if (params.length > 0) stmt.bind(params);
        if (stmt.step()) {
          const row = stmt.getAsObject();
          stmt.free();
          return row;
        }
        stmt.free();
        return undefined;
      },

      all(...params) {
        if (params.length > 0) stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
      }
    };
  },

  exec(sql) {
    if (!sqlDb) throw new Error('Database not initialized. Call db.init() first.');
    const result = sqlDb.exec(sql);
    save();
    return result;
  },

  close() {
    save();
    sqlDb = null;
  }
};

module.exports = db;
