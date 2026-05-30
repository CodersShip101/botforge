# Railway Quick Setup - VANTIS AI

Migrate from Render to Railway in ~15 minutes.

## Why Railway
- Persistent volumes (SQLite data survives redeploys)
- Custom domains (unlocks Clerk production mode)
- GitHub auto-deploy
- Free tier: $5 credit/month (enough to run this app)

---

## Step 1: Sign up for Railway

1. Go to https://railway.app
2. Click "Start a New Project"
3. Sign up with GitHub (recommended)
4. Authorize Railway to access your repositories

---

## Step 2: Deploy from GitHub

1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Find and select `trading-bot-builder`
4. Railway auto-detects Node.js (Nixpacks)
5. Deployment starts automatically

---

## Step 3: Configure Environment Variables

1. In Railway dashboard, go to your project
2. Click on your service
3. Go to **Variables** tab
4. Add these variables:

| Variable | Value |
|----------|-------|
| `CLERK_PUBLISHABLE_KEY` | Your Clerk publishable key |
| `CLERK_SECRET_KEY` | Your Clerk secret key |
| `NODE_ENV` | `production` |
| `PORT` | `5000` |

---

## Step 4: Add Persistent Volume for SQLite

1. Go to your service → **Settings** tab
2. Scroll to **Volumes**
3. Click "Add Volume"
4. Set:
   - **Mount path**: `/data`
5. Click "Create Volume"
6. Volume is automatically mounted at `/data`

Then update your `.env.local` (or Railway variables) to store SQLite in the volume:

```
DB_PATH=/data/botforge.db
```

---

## Step 5: Get a Custom Domain

1. Buy a domain from Namecheap ($0.88/year), Cloudflare, or any registrar
2. In Railway, go to your service → **Settings** → **Domains**
3. Click "Generate Domain" for a temporary Railway subdomain, OR
4. Click "Custom Domain" → enter your domain
5. Copy the DNS target (e.g. `your-project.up.railway.app`)
6. At your domain registrar, add a CNAME record pointing to that target

---

## Step 6: Create Clerk Production Instance

1. Go to https://dashboard.clerk.com
2. Click "Add application" → "Production"
3. Name: "Avantis AI Production"
4. Choose "Email + Google + Microsoft + Apple"
5. Click "Create"
6. Copy the new `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
7. Update Railway environment variables with the new keys

8. Configure redirect URLs in Clerk Dashboard:
   - Go to Clerk Dashboard → Avantis AI Production → **Redirect URLs**
   - Add: `https://yourdomain.com`
   - Add: `https://yourdomain.com/*`
   - Add: `https://yourdomain.com/dashboard.html`
   - Add: `https://yourdomain.com/oauth-callback.html`
   - (Replace `yourdomain.com` with your actual domain)

9. Set After Sign-In URL:
   - Clerk Dashboard → Avantis AI Production → Paths
   - After sign-in URL: `https://yourdomain.com/dashboard.html`
   - After sign-up URL: `https://yourdomain.com/dashboard.html`

---

## Step 7: Test OAuth

1. Visit your domain
2. Click "Sign In"
3. Click "Continue with Google"
4. Complete OAuth
5. You should be redirected to dashboard
6. **(No more Clerk dev mode page!)**

---

## Cost Breakdown

| Item | Cost |
|------|------|
| Railway free tier | $0 |
| Custom domain | $0.88-$15/year |
| Clerk Production | Free |
| **Total first year** | **~$10-15** |
| **Monthly after** | **~$0-1** |

---

## Troubleshooting

**App fails to start**: Check Railway logs. Run `node backend/server.js` locally to verify.

**Database resets on deploy**: Verify the volume mount path matches your app's DB path. Update `database.js` to use `process.env.DB_PATH || 'backend/data/botforge.db'`.

**Clerk says "invalid key"**: Make sure you updated Railway variables with the production Clerk keys (not dev keys).

**Domain not working**: DNS can take 5-10 minutes to propagate. Check with `dnschecker.org`.
