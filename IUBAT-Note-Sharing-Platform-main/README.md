# IUBAT--Note Sharing Platform

A platform for sharing academic notes at IUBAT.

## Team
- Saiful1253
- Abu Bakar Rakib
- farhannirzohor
- hamida222 

## Setup
1. Clone the repo
2. Install dependencies for frontend and backend
3. Run development servers

## Tech Stack
- Frontend: HTML / CSS / JavaScript
- Backend: Node.js / Express
- Database: MySQL / JSON files

## Deployment

### Frontend (Netlify)
1. Push this repo to GitHub
2. Sign up at [Netlify](https://app.netlify.com/)
3. Click **New site from Git** → connect your GitHub repo
4. Build settings:
   - Build command: `echo 'Static site - no build needed'`
   - Publish directory: `.` (root)
5. Click **Deploy site**

### Backend (Railway / Fly.io / Render)
The backend (`server.js`) needs a Node.js host. Recommended free options:
- [Railway.app](https://railway.app/)
- [Fly.io](https://fly.io/)
- [Render](https://render.com/)

Deploy steps for Railway:
1. Push this repo to GitHub
2. Sign up at Railway and click **New Project** → **Deploy from GitHub repo**
3. Select this repo
4. Add environment variables:
   - `PORT` = `3001`
   - `JWT_SECRET` = (any secure random string)
   - `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` = your MySQL credentials (or leave defaults for file storage)
   - `ADMIN_STUDENT_ID`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULLNAME` = admin credentials
5. Deploy. Railway will give you a backend URL like `https://your-app.up.railway.app`

### Connecting Frontend to Backend
After deploying both, set the `API_BASE_URL` environment variable in Netlify to your backend URL (e.g., `https://your-app.up.railway.app`). The frontend will use this for API calls.

## Local Development
```bash
node server.js
```
Then open `http://localhost:3001` in your browser.
