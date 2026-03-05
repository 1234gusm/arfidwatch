# Health Tracking Web App

This project is a local health-tracking web application designed to pull data from Apple Health via Health Auto Export, import macrofactor spreadsheets, maintain a calendar-based mood journal, and export entries for sharing with health providers. The app is aimed at supporting executive functioning for individuals with bipolar disorder, OCD, autism, and ARFID.

## Features

- User account registration and login system
- Import Apple Health data (Health Auto Export JSON)
- Import macrofactor spreadsheets (.xlsx)
- View health data on the main page
- Calendar view for journaling with emoji mood scale
- Multiple journal entries per day
- Click on calendar days to view and edit entries
- Export journal entries as PDF for last day, week, or month
- Runs entirely locally using a Node/Express backend and React frontend

## Project Structure

```
/ (root)
  /client - React frontend
  /server - Express backend with SQLite database
```

## Getting Started

### Prerequisites

- Node.js and npm installed

### Install Dependencies

```bash
cd server
npm install

cd ../client
npm install
```

### Run the Application

Open two terminals:

1. **Backend**
```bash
cd server
npm start
```
Server will run on `http://localhost:4000`.

2. **Frontend**
```bash
cd client
npm start
```
The React app will open in your browser at `http://localhost:3000`.

## Usage

1. Register a new account or log in.
2. On the **Health** page, paste JSON from Health Auto Export, fetch it directly from the Auto Export REST API using a URL, or upload a macrofactor CSV file.
3. Navigate to **Calendar** to add journal entries, rate your mood (1–5), and view previous notes. Mood is shown as an emoji.
4. Export PDF summaries for the past day, week, or month.

## Notes

- The backend stores users, health data, and journal entries in a local SQLite database (`server/data/health.db`).
- Health exports are expected in the format returned by Health Auto Export (JSON).
* You can optionally supply a Health Auto Export API URL and the app will fetch and import automatically (configured in the Health page). It will poll periodically when an URL is set.
* This app runs entirely on your local machine; no external servers are required.
* **Security**: passwords are hashed with bcrypt; adjust `SALT_ROUNDS` via env var for higher strength. To run over HTTPS, start the Express server with an SSL certificate (see Node/Express docs) and change the frontend's API URL accordingly.
* **Offline & desktop**: you can package the client/backend using Electron for a true desktop experience; simply point the renderer to `http://localhost:4000` and bundle both folders. A minimal `main.js` might look like:

  ```js
  const { app, BrowserWindow } = require('electron');
  function createWindow() {
    const win = new BrowserWindow({ width: 1200, height: 800 });
    win.loadURL('http://localhost:3000');
  }
  app.whenReady().then(createWindow);
  ```

  then run your backend and `npm start` the React app inside the Electron build.
* **History**: journal entries and moods are stored indefinitely — view past logs by navigating the calendar and exporting reports.

## Deploying Backend To Render

The repository includes `render.yaml` configured for the backend under `server/`.

1. Push this repository to GitHub.
2. In Render, create a new Web Service from this repository.
3. Render should detect `render.yaml`. Keep:
  - `rootDir: server`
  - `buildCommand: npm install`
  - `startCommand: npm start`
4. Add/confirm env vars:
  - `NODE_ENV=production`
  - `JWT_SECRET=<long-random-secret>`
  - `SQLITE_PATH=/var/data/health.db`
  - `SALT_ROUNDS=12`
5. Add a persistent disk mounted at `/var/data`.
6. Optional for email reset codes in production:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
7. Deploy latest commit.

After deploy, verify your API is live and updated:

```bash
BASE="https://<your-render-service>.onrender.com"
curl -sS "$BASE/api/profile"
```

If authenticated calls still fail after deploy, verify the service is running the latest commit and that `JWT_SECRET` is set.

Feel free to customize visuals, analytics, or extend features as needed.
