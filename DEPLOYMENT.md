# Vercel Deployment Guide

## Setup Steps

### 1. **Push to GitHub**
```bash
git add .
git commit -m "Setup for Vercel deployment with auth system"
git push origin main
```

### 2. **Create Vercel Project**
- Go to https://vercel.com
- Click "New Project"
- Import GitHub repository
- Select `web.ana` project
- Click "Import"

### 3. **Configure Environment Variables**
In Vercel Project Settings → Environment Variables, add:

| Variable | Value | Environment |
|----------|-------|-------------|
| `DATABASE_URL` | Your PostgreSQL URL from Neon | Production, Preview, Development |
| `VITE_API_URL` | Leave empty for dev, set to your Vercel URL for prod | Production |

Example:
- `DATABASE_URL`: `postgresql://neondb_owner:npg_m3iTlQR6hOyo@ep-round-credit-av06aniu.c-11.us-east-1.aws.neon.tech/neondb?sslmode=require`
- `VITE_API_URL`: `https://web-ana.vercel.app` (after first deployment)

### 4. **Build Settings**
- **Framework**: Other
- **Build Command**: `npm run build`
- **Install Command**: `npm run install:all`
- **Output Directory**: `frontend/dist`
- **Start Command**: `npm start`

### 5. **Deploy**
- Click "Deploy"
- Wait for build to complete
- Your app will be live at `https://web-ana.vercel.app`

## How It Works

### Development (localhost)
1. Frontend (3001) uses Vite proxy to reach backend (4000)
2. All `/api/*` requests → `http://localhost:4000/api/*`
3. `VITE_API_URL` is empty

### Production (Vercel)
1. Frontend and backend are on same domain
2. `/api/*` routes → backend via vercel.json
3. `VITE_API_URL` is `https://web-ana.vercel.app`
4. Frontend can make requests to same domain

## Deployment Files Configured

- ✅ `vercel.json` - Routes and build config
- ✅ `.env.example` - Environment template
- ✅ `package.json` - Build scripts
- ✅ `frontend/vite.config.ts` - Environment variable support
- ✅ `frontend/src/pages/Login.tsx` - Dynamic API URL

## Testing After Deployment

1. Go to your Vercel URL
2. Try **Register** with new account
3. Try **Login** with credentials
4. Both should work without connection errors!

## Troubleshooting

### "Connection error" on Vercel
- Check DATABASE_URL is correct
- Check VITE_API_URL is set to your Vercel domain
- Check backend/dist/server.js exists after build

### Database errors
- Verify DATABASE_URL in Vercel environment
- Make sure database migrations ran (should happen in build)
- Check Neon console for active connections

### Frontend can't reach backend
- VITE_API_URL should be same as your Vercel domain
- Or leave VITE_API_URL empty (will use relative paths via vercel.json routes)

## Local Testing Before Deploy

```bash
# Build locally first
npm run build

# Test frontend build
cd frontend
npm run build

# Test backend build
cd ../backend
npm run build

# Back to root
cd ..
```

If builds succeed locally, they'll succeed on Vercel!
