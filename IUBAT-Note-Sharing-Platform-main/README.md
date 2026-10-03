# IUBAT Note Sharing Platform

A modern academic note-sharing platform designed for IUBAT students to upload, discover, and manage course materials efficiently.

## Overview

The IUBAT Note Sharing Platform enables students to:

- Upload and share academic notes by department and subject
- Browse notes submitted by other students
- Like and download course materials
- Communicate through student messaging and notifications
- Receive platform announcements from administrators
- Manage user accounts with secure authentication

This project combines a lightweight frontend experience with a Node.js/Express backend and support for both MySQL and local JSON-based storage.

## Features

- Student registration and login
- Admin authentication and dashboard support
- Note upload, listing, filtering, and management
- Department and subject-based organization
- Download and like tracking
- Real-time notifications through Socket.IO
- Announcement system for updates and notices
- Responsive UI for desktop and mobile users
- Flexible deployment for static frontend + backend hosting

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express.js
- Real-time communication: Socket.IO
- Authentication: JWT, bcryptjs
- Database options: MySQL or JSON file storage
- Deployment: Netlify (frontend), Railway/Fly.io/Render (backend)

## Project Structure

```text
IUBAT-Note-Sharing-Platform-main/
├── public/                 # Static frontend files
├── data/                   # Local JSON storage (fallback mode)
├── .gitignore
├── CNAME
├── netlify.toml
├── package.json
├── package-lock.json
├── README.md
├── server.js               # Express API and business logic
└── ...
```

## Prerequisites

Before running the project locally, make sure you have:

- Node.js 16 or newer
- npm
- MySQL (optional, only if using database mode)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/Abu-Bakar-Rakib/IUBAT-Note-Sharing-Platform.git
cd IUBAT-Note-Sharing-Platform/IUBAT-Note-Sharing-Platform-main
```

2. Install dependencies:

```bash
npm install
```

## Configuration

Create a `.env` file in the project root if you want to customize the application:

```env
PORT=3001
JWT_SECRET=your_secure_secret_key
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=ishare_db
ADMIN_STUDENT_ID=123456
ADMIN_EMAIL=admin@ishare.com
ADMIN_PASSWORD=admin123
ADMIN_FULLNAME=System Admin
```

Notes:

- If `DB_HOST` is not set, the application falls back to JSON file storage.
- Admin credentials are automatically initialized when the server starts.

## Running the Application

Start the server:

```bash
npm start
```

Then open the app in your browser:

```text
http://localhost:3001
```

## Local Development

To run the project in development mode:

```bash
node server.js
```

## Deployment

### Frontend Deployment (Netlify)

1. Push the project to GitHub.
2. Open [Netlify](https://app.netlify.com/).
3. Choose “New site from Git” and connect the repository.
4. Use the following settings:
   - Build command: `echo 'Static site - no build needed'`
   - Publish directory: `.`
5. Deploy the site.

### Backend Deployment

Recommended hosting options:

- [Railway](https://railway.app/)
- [Render](https://render.com/)
- [Fly.io](https://fly.io/)

Example backend environment variables for Railway:

- `PORT=3001`
- `JWT_SECRET=<your_secure_random_string>`
- `DB_HOST=<database_host>`
- `DB_USER=<database_user>`
- `DB_PASSWORD=<database_password>`
- `DB_NAME=<database_name>`
- `ADMIN_STUDENT_ID`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_FULLNAME`

After deployment, point the frontend API base URL to the backend service URL.

## API Highlights

The backend exposes REST API endpoints for:

- Authentication (`/api/auth/*`)
- User management (`/api/users`)
- Notes (`/api/notes`)
- Announcements (`/api/announcements`)
- Departments and subjects (`/api/departments`, `/api/subjects`)
- Messaging (`/api/messages`)
- Notifications (`/api/notifications`)
- Summary statistics (`/api/stats/summary`)

## Team

- Saiful1253
- Abu Bakar Rakib
- farhannirzohor
- hamida222

## License

This project is licensed under the MIT License.

## Contributing

Contributions are welcome. If you would like to improve the platform, please fork the repository and submit a pull request with a clear description of the changes.

## Contact

For questions or collaboration opportunities, please reach out through the repository owner or project contributors.
