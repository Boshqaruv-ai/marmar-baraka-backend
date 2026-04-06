# Marmar Baraka Backend API

## Railway Deployment - Required Environment Variables

Your backend is crashing because these **required** environment variables are missing in production:

### Database Configuration
```
DB_HOST=<your-railway-postgres-host>
DB_PORT=5432
DB_NAME=<your-database-name>
DB_USER=<your-database-user>
DB_PASSWORD=<your-database-password>
```

### Security Secrets (Generate random strings for these)
```
JWT_SECRET=<generate-a-long-random-string>
JWT_REFRESH_SECRET=<generate-another-long-random-string>
SESSION_SECRET=<generate-yet-another-long-random-string>
```

### Other Important Variables
```
NODE_ENV=production
PORT=5000
FRONTEND_URL=<your-vercel-frontend-url>
```

## How to Set Environment Variables in Railway

1. Go to your Railway project dashboard
2. Click on your backend service
3. Go to the "Variables" tab
4. Add each environment variable listed above

## Generating Secure Secrets

You can generate secure random strings using:

```bash
# On Linux/Mac/Git Bash
openssl rand -base64 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Database Setup

If you're using Railway's PostgreSQL:
1. Add a PostgreSQL service to your project
2. Railway will automatically provide connection variables
3. Copy the connection details to your environment variables

## Quick Fix

Add these to Railway right now (replace with your actual values):

```
NODE_ENV=production
DB_HOST=<from-railway-postgres>
DB_USER=<from-railway-postgres>
DB_PASSWORD=<from-railway-postgres>
DB_NAME=<from-railway-postgres>
JWT_SECRET=<generate-random-32-char-string>
JWT_REFRESH_SECRET=<generate-random-32-char-string>
SESSION_SECRET=<generate-random-32-char-string>
FRONTEND_URL=https://your-app.vercel.app
```

After adding these variables, Railway will automatically redeploy your backend and it should start successfully.
