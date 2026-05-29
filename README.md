# BotForge — Free Trading Bot Builder

Build custom MT4 & MT5 Expert Advisors (EAs) in your browser. No coding required.

## Quick Start

### Option 1: Frontend only (no backend required)

Open `index.html` in a browser. Everything runs client-side using localStorage.

### Option 2: Full stack (with backend API)

**Prerequisites:** Node.js 18+, PostgreSQL 14+

```bash
# 1. Create the database
createdb botforge

# 2. Install dependencies & run migrations
npm run setup

# 3. Start the API server
npm start
```

The API runs on `http://localhost:5000`. Open `index.html` in a browser.

### Option 3: Docker

```bash
docker-compose up --build
```

## Project Structure

```
trading-bot-builder/
├── index.html         # Landing page
├── builder.html       # Bot builder (6-step wizard)
├── dashboard.html     # Saved bots management
├── login.html         # Authentication
├── register.html
├── docs.html          # Documentation & install guide
├── css/style.css      # Dark-themed UI
├── js/
│   ├── app.js         # API client, auth, localStorage fallback
│   ├── builder.js     # Bot builder form logic
│   ├── code-generator-mt4.js  # MQL4 code generation (frontend)
│   └── code-generator-mt5.js  # MQL5 code generation (frontend)
├── backend/
│   ├── server.js      # Express API entry point
│   ├── config/        # Database connection & migration
│   ├── controllers/   # Auth & Bot CRUD logic
│   ├── middleware/     # JWT authentication
│   ├── routes/        # API route definitions
│   ├── services/      # Code generation engine
│   └── tests/         # Jest test suite
├── database/
│   └── init.sql       # PostgreSQL schema
└── docker-compose.yml # Containerized deployment
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/auth/me` | Current user |
| POST | `/api/bots` | Create bot |
| GET | `/api/bots` | List user's bots |
| GET | `/api/bots/:id` | Get single bot |
| PUT | `/api/bots/:id` | Update bot |
| DELETE | `/api/bots/:id` | Delete bot |
| GET | `/api/bots/:id/download?platform=mt4` | Download .mq4/.mq5 |
| GET | `/api/health` | Health check |

## Running Tests

```bash
cd backend
npm test
```

The code generator tests run without a database. API integration tests require PostgreSQL.

## Supported Strategies

- Grid Trading
- Martingale
- Hedging
- Trend Following
- Scalping

## License

MIT
