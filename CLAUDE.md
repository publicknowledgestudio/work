# PK Work — Task Management for Public Knowledge Studio

## Quick Overview

This is a task management + scrum automation system for the Public Knowledge Studio team. It has a web app (Vite + vanilla JS), a Firebase backend (Firestore + Cloud Functions), and a Slack integration via the bot **Scrumpy** in the **#daily-scrum** channel.

## Architecture

```
Frontend (Vite)  →  Firebase Hosting (workdotpk-a06dc.web.app)
                     ↓
                 Firestore (tasks, standups, clients, projects, notes)
                     ↑
Cloud Functions  →  api (REST API for CRUD)
                 →  slackWebhook (posts to Slack via incoming webhook)
                     ↑
Slack #daily-scrum ← Scrumpy bot (incoming webhook)
                   ← Claude bot (reads/writes via Slack MCP)
```

## Key URLs

- **Firebase project:** workdotpk-a06dc
- **Hosting:** https://workdotpk-a06dc.web.app
- **API endpoint:** https://us-central1-workdotpk-a06dc.cloudfunctions.net/api
- **Slack webhook endpoint:** https://us-central1-workdotpk-a06dc.cloudfunctions.net/slackWebhook
- **Slack channel:** #daily-scrum
- **Slack bot name:** Scrumpy

## Project Structure

```
src/              Frontend (Vite + vanilla JS)
  config.js       Firebase config, team members, statuses, priorities
  main.js         Auth, routing, state
  db.js           Firestore CRUD operations
  board.js        Kanban board view
  my-tasks.js     Personal task view
  standup.js      Standup form
  modal.js        Task create/edit modal
functions/        Cloud Functions backend
  index.js        All API endpoints (api + slackWebhook)
firestore.rules   Security rules (@publicknowledge.co only)
firestore.indexes.json  Composite indexes
```

## Firebase Secrets

Two secrets are set via `firebase functions:secrets:set`:
- `CLAUDE_API_KEY` — authenticates API requests (sent as `x-api-key` header)
- `SLACK_WEBHOOK_URL` — Scrumpy's incoming webhook for posting to #daily-scrum

## API Endpoints

All endpoints on `api` require header: `x-api-key: <CLAUDE_API_KEY>`

| Method | Path | Description |
|--------|------|-------------|
| GET | /tasks | List tasks (filters: assignee, status, clientId, projectId) |
| POST | /tasks | Create task |
| PATCH | /tasks/:id | Update task |
| DELETE | /tasks/:id | Delete task |
| GET | /scrum | Daily scrum summary |
| POST | /standups | Submit standup |
| GET | /standups | List standups (filter: userEmail) |
| GET | /clients | List clients |
| GET | /projects | List projects |
| POST | /notes | Store meeting notes |

The `slackWebhook` endpoint accepts POST with `x-api-key` header and an `action` field:
- `{"action": "scrum"}` — posts daily scrum summary to #daily-scrum
- `{"action": "standup", "userEmail", "userName", "yesterday", "today", "blockers"}` — saves and posts standup
- `{"action": "create_task", "title", "assignee", ...}` — creates task and posts confirmation

## Team

| Name | Email |
|------|-------|
| Gyan | gyan@publicknowledge.co |
| Charu | charu@publicknowledge.co |
| Sharang | sharang@publicknowledge.co |
| Anandu | anandu@publicknowledge.co |

Auth is restricted to @publicknowledge.co Google accounts.

## Firestore Collections

- **tasks** — title, description, assignee, status, priority, clientId, projectId, deadline, notes[], timestamps
- **standups** — userEmail, userName, yesterday, today, blockers, date
- **clients** — name (seeded: SCC Online, Hammock, Brunk)
- **projects** — name, clientId
- **notes** — content, source, taskIds, createdBy

## Task Statuses & Priorities

Statuses: backlog, todo, in_progress, review, done
Priorities: low, medium, high, urgent

## Common Commands

```bash
npm run dev           # Local dev server (port 3000)
npm run build         # Build to dist/
npm run deploy        # Build + deploy everything
firebase deploy --only functions    # Deploy functions only
firebase deploy --only hosting      # Deploy hosting only
firebase deploy --only firestore:rules  # Deploy security rules
```

## Working with Slack

When users in #daily-scrum ask Claude to manage tasks, use the API endpoint with the `x-api-key` header. See CLAUDE_SCRUM_MASTER.md for the full Slack interaction guide with examples of natural language commands and expected API calls.
