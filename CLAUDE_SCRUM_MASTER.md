# Claude Scrum Master — Slack Integration Guide

Claude acts as the scrum master for Public Knowledge Studio, managing tasks and standups via Slack and the Cloud Functions API.

## Slack Commands

### `@claude scrum`

Generates the daily scrum summary. Claude should:

1. Call `GET /scrum` on the Cloud Functions API
2. Format and post a summary like:

```
📋 Daily Scrum — Feb 15, 2026

✅ Closed Yesterday:
  Gyan: Implement auth flow (#task-id)
  Charu: Fix responsive layout (#task-id)
  Sharang: —
  Anandu: Review API docs (#task-id)

📌 Currently Open:
  Gyan (3 tasks):
    • [In Progress] Dashboard charts - Client X / Project Y
    • [To Do] API pagination - Client X / Project Y
    • [Review] User settings page - Internal

  Charu (2 tasks):
    • [In Progress] Mobile nav redesign - Client Z
    • [To Do] Icon library update - Internal

  Sharang (1 task):
    • [In Progress] Content strategy doc - Client X

  Anandu (2 tasks):
    • [In Progress] Video encoding pipeline - Client Z
    • [To Do] CDN setup - Client Z

  Unassigned (1 task):
    • [To Do] Update SSL certificates - Internal
```

### `@claude <natural language>`

Claude interprets what the user wants and takes action. Examples:

| User says | Claude does |
|-----------|-------------|
| `@claude assign the SSL task to Sharang` | `PATCH /tasks/:id` with `assignee: sharang@publicknowledge.co` |
| `@claude move dashboard charts to review` | `PATCH /tasks/:id` with `status: review` |
| `@claude create a task for Charu: update brand colors, deadline Friday, client Acme` | `POST /tasks` with title, assignee, deadline, clientId |
| `@claude what's Anandu working on?` | `GET /tasks?assignee=anandu@publicknowledge.co&status=in_progress` |
| `@claude push deadline for API pagination to next Monday` | `PATCH /tasks/:id` with new deadline |
| `@claude mark video encoding as done` | `PATCH /tasks/:id` with `status: done` |
| `@claude add a note to dashboard charts: discussed in client meeting, they want bar charts not pie` | `PATCH /tasks/:id` appending to notes array |

### `@claude` with Granola / Meeting Notes

When someone pastes meeting notes, Claude should:
1. Parse the notes to extract action items
2. Match action items to existing tasks or create new ones
3. Post a summary of what was created/updated

Example:
```
User: @claude here are the notes from the Acme sync:
- Gyan to finish dashboard by Thursday
- Need to add export to PDF feature
- Charu: mobile nav is blocked by API team

Claude: Got it! Here's what I did:
  ✏️ Updated "Dashboard charts" — deadline set to Thu Feb 19
  ➕ Created "Add export to PDF" — assigned to backlog, client: Acme
  🚧 Added blocker note to "Mobile nav redesign" — blocked by API team
```

## API Reference

Base URL: `https://<region>-<project>.cloudfunctions.net/api`

All requests require header: `x-api-key: <CLAUDE_API_KEY>`

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tasks` | List tasks. Filters: `?assignee=&status=&clientId=&projectId=` |
| POST | `/tasks` | Create task. Body: `{ title, description, assignee, status, priority, deadline, clientId, projectId, notes }` |
| PATCH | `/tasks/:id` | Update task. Body: any task fields |
| DELETE | `/tasks/:id` | Delete task |

### Scrum

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/scrum` | Daily summary: closed yesterday + open items per person |

### Standups

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/standups` | Submit standup. Body: `{ userEmail, userName, yesterday, today, blockers }` |
| GET | `/standups` | List recent standups. Filter: `?userEmail=` |

### Reference Data

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clients` | List all clients |
| GET | `/projects` | List all projects |
| POST | `/notes` | Store meeting notes. Body: `{ content, source, taskIds, createdBy }` |

## Firestore Data Model

### `tasks/{id}`
```json
{
  "title": "Implement auth flow",
  "description": "Add Google SSO...",
  "clientId": "abc123",
  "projectId": "def456",
  "assignee": "gyan@publicknowledge.co",
  "status": "in_progress",
  "priority": "high",
  "deadline": "<Timestamp>",
  "notes": [
    { "text": "Discussed in standup", "author": "Charu", "timestamp": "2026-02-14T10:00:00Z" }
  ],
  "createdAt": "<Timestamp>",
  "updatedAt": "<Timestamp>",
  "closedAt": "<Timestamp or null>",
  "createdBy": "gyan@publicknowledge.co"
}
```

### `clients/{id}`
```json
{
  "name": "Acme Corp",
  "createdAt": "<Timestamp>"
}
```

### `projects/{id}`
```json
{
  "name": "Website Redesign",
  "clientId": "abc123",
  "createdAt": "<Timestamp>"
}
```

### `standups/{id}`
```json
{
  "userEmail": "gyan@publicknowledge.co",
  "userName": "Gyan",
  "yesterday": "Worked on auth flow",
  "today": "Continue auth, start dashboard",
  "blockers": "Waiting on design specs",
  "date": "<Timestamp>"
}
```

## Team Members

| Name | Email | Slack handle |
|------|-------|------|
| Gyan | gyan@publicknowledge.co | Map to Slack user ID |
| Charu | charu@publicknowledge.co | Map to Slack user ID |
| Sharang | sharang@publicknowledge.co | Map to Slack user ID |
| Anandu | anandu@publicknowledge.co | Map to Slack user ID |

## Setup Instructions

### 1. Firebase Project

1. Create a project at [Firebase Console](https://console.firebase.google.com)
2. Enable **Authentication** → Google provider
3. Restrict Google sign-in to `publicknowledge.co` domain
4. Enable **Firestore** in production mode
5. Deploy security rules: `firebase deploy --only firestore:rules`

### 2. Web App

1. Register a web app in Firebase Console → Project Settings → Add app
2. Copy the config object into `src/config.js`
3. Install and build: `npm install && npm run build`
4. Deploy: `firebase deploy --only hosting`
5. Set up custom domain `work.publicknowledge.co` in Firebase Hosting

### 3. Cloud Functions

1. Set the API key: `firebase functions:secrets:set CLAUDE_API_KEY`
2. Deploy: `firebase deploy --only functions`
3. Note the function URL for Claude's Slack integration

### 4. Slack App Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name it (e.g. "Claude Scrum Master") and pick your workspace

#### Bot Token Scopes (OAuth & Permissions)

Add these scopes under **Bot Token Scopes**:

| Scope | Purpose |
|-------|---------|
| `chat:write` | Post messages to channels |
| `app_mentions:read` | Receive @mention events |
| `users:read` | Look up Slack user info to match team members |
| `users:read.email` | Match Slack users to team member emails |

#### Event Subscriptions

1. Enable **Event Subscriptions**
2. Set **Request URL** to: `https://<region>-workdotpk-a06dc.cloudfunctions.net/slack`
3. Subscribe to **bot events**: `app_mention`
4. Save changes

#### Install to Workspace

1. Go to **Install App** → **Install to Workspace** → Authorize
2. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

#### Firebase Secrets

Set the Slack secrets in Firebase:

```bash
firebase functions:secrets:set SLACK_BOT_TOKEN
# Paste the xoxb-... token

firebase functions:secrets:set SLACK_SIGNING_SECRET
# Found in Slack app → Basic Information → Signing Secret
```

#### Deploy & Test

```bash
firebase deploy --only functions

# In Slack, invite the bot to a channel, then try:
# @Claude scrum
# @Claude help
```

### 5. Seed Initial Data

Add clients and projects via the Firebase Console or using `curl`:

```bash
API_URL="https://<region>-<project>.cloudfunctions.net/api"
API_KEY="your-secret-key"

# Add a client
curl -X POST "$API_URL/clients" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"name": "Acme Corp"}'

# Add a project
curl -X POST "$API_URL/projects" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"name": "Website Redesign", "clientId": "CLIENT_ID_HERE"}'
```
