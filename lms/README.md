# VUMCA hITECH LMS

Learning Management System for the Computer Science class. Node.js + Express + SQLite.

## Requirements

- **Node.js 22.13 or newer** (Node 22.13+, 23.4+, or any Node 24+)
- No database server needed — SQLite is built into Node.js via the `node:sqlite` module.

## Why no native compilation?

The database layer uses `node:sqlite` (`DatabaseSync`), which ships **inside Node.js itself**.
There are **zero native npm dependencies** (deps are `express`, `express-session`, `bcryptjs` —
all pure JavaScript). This means `npm install` never runs `node-gyp` / compilation, so the app
runs on standard shared hosting such as **Hostinger** without any build tools.

> Note: `node:sqlite` is built-in starting Node 22.13. On Node 22.5–22.12 it requires the
> `--experimental-sqlite` flag, so pick Node 22.13+ (or Node 24) in your hosting panel.

## Run locally

```bash
npm install
npm start
```

The app listens on `http://localhost:3001` (override with the `PORT` env var).
The SQLite file is created automatically at `data/lms.db` and seeded on first run.

## Demo credentials

| Role    | Username | Password    |
|---------|----------|-------------|
| Admin   | admin    | admin123    |
| Student | STU001   | student123  |

## Features

- **Login** — separate admin / student portals with session auth
- **Admin console** — dashboard stats, manage students, courses, enrollments,
  assignments (with submission grading), quizzes (builder + auto-grading), daily
  attendance (present / late / absent)
- **Student portal** — view courses, submit assignments, take quizzes with
  instant scores, attendance log, and grades

## Deploying on Hostinger (shared Node.js hosting)

1. Upload the project files (the `lms/` folder) to your hosting directory.
   Exclude `node_modules/` and `data/` — they regenerate on the server.
2. In the hosting control panel, create a **Node.js app** pointing at this folder.
3. Set the **Node.js version to 22.13+** (e.g. Node 24 LTS) — this is required for
   the built-in SQLite module.
4. Set the **application root** to the project folder and the **entry file** to
   `server/index.js`.
5. Run `npm install` (from the panel's terminal, or it runs on app start).
6. Add a `.env` if needed: `PORT=3001` (or use the panel's assigned port).
7. Start the app. No build step, no compilation, no external database required.

## Project structure

```
lms/
  package.json
  server/
    index.js   # Express app + REST API routes
    db.js      # node:sqlite database layer (schema + seed)
  public/
    index.html        # landing page
    login.html        # login portal
    admin.html        # admin console
    student.html      # student portal
    css/style.css
    js/               # common.js, admin.js, student.js
```
