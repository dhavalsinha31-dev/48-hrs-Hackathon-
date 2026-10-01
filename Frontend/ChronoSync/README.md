# ?? ChronoSync — Time-Locked Task Management Portal

> A full-stack, role-secured, real-time task management system built in 48 hours during an internal hackathon. Tasks auto-expire after 10 minutes, and access is gated by a 3-tier clearance hierarchy.

---

## ?? Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Role & Clearance System](#role--clearance-system)
- [Getting Started](#getting-started)
- [Environment Details](#environment-details)
- [How It Works](#how-it-works)
- [Security Highlights](#security-highlights)

---

## ?? Overview

**ChronoSync** is a time-locked task operations portal built as a 48-hour hackathon project. The platform simulates a high-stakes mission-control environment where:

- Tasks are **self-destructing** — they auto-expire after **10 minutes** of creation.
- Crew members have **tiered clearance levels** that gate which tasks they can create or delete.
- The interface reflects **real-time countdowns** with urgency indicators in the last 60 seconds.
- A **cyberpunk-inspired command center UI** provides an immersive operator experience.

---

## ? Features

### ?? Authentication & Session Management
- Secure username/password login with **server-side session handling**
- Sessions persist across page reloads via `httpOnly` cookies
- Session is destroyed cleanly on logout (cookie cleared + session store invalidated)

### ??? Role-Based Access Control (RBAC)
- **3-tier clearance system:** `LEVEL_1 (Operator)` ? `LEVEL_2 (Officer)` ? `LEVEL_3 (Commander)`
- Users can only **create** tasks at or below their clearance level
- Users can only **delete/complete** tasks they have sufficient clearance for
- RBAC is enforced on both the **backend middleware** AND **frontend UI**

### ? Time-Locked Task Lifecycle
- Every task is given a **10-minute expiration timestamp** at the moment of creation
- The backend **automatically prunes expired tasks** on every `GET /tasks` request
- The frontend displays a **live countdown timer** per task, updating every second
- Tasks entering the **last 60 seconds** trigger a pulsing red urgency style

### ?? Real-Time Synchronization
- A `setInterval` timer in React syncs system time every **1 second**
- If any task is detected as expired on the client, it auto-triggers a **server refetch**
- The dashboard live-updates task count, system GMT time, and countdowns

### ??? Atomic Data Persistence
- Uses a flat **JSON file as the database** (`db.json`)
- All writes use a **Promise-based mutex lock** to prevent race conditions
- Writes are **atomic**: data is written to a `.tmp` file first, then renamed to prevent corruption

---

## ??? Tech Stack

| Layer        | Technology                             |
|--------------|----------------------------------------|
| Frontend     | React 19, Vite 8, JSX                  |
| Styling      | Vanilla CSS (glassmorphism, dark mode) |
| Backend      | Node.js, Express.js 5                  |
| Auth         | express-session (cookie-based)         |
| Database     | JSON flat file (`db.json`)             |
| Dev Tools    | Nodemon, ESLint, Vite HMR              |
| ID Gen       | UUID v4                                |

---

## ??? System Architecture

```
+-------------------------------------------------+
¦                   CLIENT (React)                ¦
¦  +------------+   +-----------+   +----------+  ¦
¦  ¦  Login UI  ¦   ¦ Dashboard ¦   ¦Countdown ¦  ¦
¦  ¦  (Session) ¦   ¦ (Tasks)   ¦   ¦ Timers   ¦  ¦
¦  +------------+   +-----------+   +----------+  ¦
+--------+----------------+--------------+--------+
         ¦  HTTP + Cookies (credentials: include)
+--------?----------------?--------------?--------+
¦                 SERVER (Express.js)             ¦
¦  +--------------+     +----------------------+  ¦
¦  ¦  Auth Routes ¦     ¦   Task Routes        ¦  ¦
¦  ¦  /auth/login ¦     ¦   /nexus/tasks       ¦  ¦
¦  ¦  /auth/me    ¦     ¦   clearanceGuard()   ¦  ¦
¦  ¦  /auth/logout¦     ¦   middleware         ¦  ¦
¦  +--------------+     +----------------------+  ¦
¦         ¦                        ¦              ¦
¦  +------?------------------------?-----------+  ¦
¦  ¦       JSON File Store (db.json)           ¦  ¦
¦  ¦   Mutex Lock + Atomic Write (tmp swap)    ¦  ¦
¦  +-------------------------------------------+  ¦
+-------------------------------------------------+
```

---

## ?? Project Structure

```
48 hrs Hackathon/
+-- Backend/
¦   +-- server.js          # Express server — auth, task routes, clearance middleware
¦   +-- db.json            # Flat-file JSON database (users + tasks)
¦   +-- nodemon.json       # Nodemon config (ignores db.json changes to avoid restart loops)
¦   +-- package.json       # Dependencies: express, cors, express-session, uuid
¦
+-- Frontend/
    +-- ChronoSync/
        +-- src/
        ¦   +-- App.jsx    # Main React component — all UI, state, and API logic
        ¦   +-- App.css    # Cyberpunk command-center styles (glassmorphism, dark mode)
        ¦   +-- index.css  # Global CSS variables and base reset
        ¦   +-- main.jsx   # React root entry point
        +-- index.html     # HTML shell
        +-- vite.config.js # Vite build config
        +-- package.json   # Dependencies: react, react-dom, vite
```

---

## ?? API Reference

### Authentication

| Method | Endpoint           | Description                       | Auth Required |
|--------|--------------------|-----------------------------------|---------------|
| `GET`  | `/api/auth/me`     | Returns current session user      | No            |
| `POST` | `/api/auth/login`  | Authenticates user, sets session  | No            |
| `POST` | `/api/auth/logout` | Destroys session, clears cookie   | No            |

**Login request body:**
```json
{
  "username": "commander",
  "password": "commander123"
}
```

---

### Tasks (Nexus)

| Method   | Endpoint                | Description                            | Auth Required  |
|----------|-------------------------|----------------------------------------|----------------|
| `GET`    | `/api/nexus/tasks`      | Returns all active (non-expired) tasks | Yes (session)  |
| `POST`   | `/api/nexus/tasks`      | Creates a new time-locked task         | Yes + Clearance|
| `DELETE` | `/api/nexus/tasks/:id`  | Completes/deletes a task by ID         | Yes + Clearance|

**Create task request body:**
```json
{
  "description": "Recalibrate antimatter containment fields.",
  "clearanceRequired": "LEVEL_2"
}
```

**Task response object:**
```json
{
  "id": "task_a1b2c3d4",
  "description": "Recalibrate antimatter containment fields.",
  "clearanceRequired": "LEVEL_2",
  "expirationTimestamp": 1727820600000
}
```

---

## ?? Role & Clearance System

| Clearance Level           | Username    | Password       | Can Create          | Can Delete   |
|---------------------------|-------------|----------------|---------------------|--------------|
| `LEVEL_1` — Operator      | `operator`  | `operator123`  | LEVEL_1 tasks only  | LEVEL_1 only |
| `LEVEL_2` — Officer       | `officer`   | `officer123`   | LEVEL_1–2 tasks     | LEVEL_1–2    |
| `LEVEL_3` — Commander     | `commander` | `commander123` | All tasks           | All tasks    |

> **Rule:** A user can only create or delete tasks at or **below** their own clearance level. Violations return `403 Forbidden`.

---

## ?? Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd "48 hrs Hackathon"
```

### 2. Start the Backend
```bash
cd Backend
npm install
npm run dev
# Server runs on http://localhost:5000
```

### 3. Start the Frontend
```bash
cd Frontend/ChronoSync
npm install
npm run dev
# App runs on http://localhost:5173
```

### 4. Open in browser
Navigate to **`http://localhost:5173`** and log in with any of the credentials above.

---

## ?? Environment Details

| Config               | Value                              |
|----------------------|------------------------------------|
| Backend Port         | `5000`                             |
| Frontend Port        | `5173` (Vite default)              |
| CORS Allowed Origins | `localhost` and `127.0.0.1` only   |
| Session Duration     | 24 hours                           |
| Task Expiry Time     | 10 minutes from creation           |
| Urgency Threshold    | < 60 seconds remaining             |

---

## ?? How It Works

### Task Expiration Flow
```
User creates task
      ¦
      ?
Backend assigns expirationTimestamp = Date.now() + 10 min
      ¦
      ?
React client detects expired task via live 1-second timer
      ¦
      ?
GET /nexus/tasks ? backend filters expired tasks ? saves cleaned DB ? returns active tasks
```

### Concurrency-Safe Write
```
Request to write DB
      ¦
      ?
Acquire mutex lock (Promise chain)
      ¦
      ?
Write to db.json.tmp
      ¦
      ?
Rename .tmp ? db.json  (atomic swap — prevents corruption)
      ¦
      ?
Release lock
```

---

## ?? Security Highlights

- **`httpOnly` cookies** — session cookie is inaccessible to JavaScript, preventing XSS theft.
- **`sameSite: lax`** — mitigates CSRF attacks on state-changing requests.
- **CORS locked to localhost** — rejects all non-local origins in production safety mode.
- **Clearance enforced server-side** — frontend disables buttons as UX, but all real enforcement happens in the `clearanceGuard` Express middleware.
- **Password never sent to client** — login response strips the `password` field before storing in session.
- **Atomic writes** — prevents partial/corrupt database states under concurrent access.

---

## ?? Hackathon Context

Built as part of a **48-hour internal hackathon**. The project demonstrates:
- Rapid full-stack prototyping under time constraints
- Secure backend architecture with RBAC from the ground up
- Immersive, production-quality UI/UX built without a CSS framework
- Real-time state synchronization without external libraries (no Redux, no Socket.io)

---

*Built with ? and minimal sleep in 48 hours.*
