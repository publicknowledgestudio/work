# Design: Add Asty as a Team Member

**Date:** 2026-02-21
**Status:** Approved

## Overview

Add Asty (the AI studio manager) as a team member on work.publicknowledge.co so that tasks can be assigned to Asty. When a task is assigned to Asty, a webhook notifies the OpenClaw gateway on the Oracle VM, which then posts to the `#tell-asty` Slack channel.

## Components

### 1. Frontend — `src/config.js`

Add one entry to the `TEAM` array:

```js
{ email: 'asty@publicknowledge.co', name: 'Asty', color: '#10b981' }
```

No other frontend files change. Asty gets a teal "A" avatar and appears in:
- The "By Assignee" board column
- The task modal assignee picker
- The @ mention dropdown in quick-add inputs

### 2. Cloud Functions — `functions/index.js`

Two new Firebase secrets:
- `OPENCLAW_WEBHOOK_URL` — the Oracle VM webhook endpoint (e.g. `http://<VM_IP>:3001/webhook`)
- `OPENCLAW_WEBHOOK_SECRET` — shared secret for request authentication

**Trigger:** After any `POST /tasks` (create) or `PATCH /tasks/:id` (update) where `asty@publicknowledge.co` is present in the resulting `assignees` array, fire a fire-and-forget POST to the webhook. The task operation succeeds regardless of webhook outcome.

**Payload:**
```json
{
  "event": "task_assigned",
  "action": "created" | "updated",
  "task": {
    "id": "...",
    "title": "...",
    "status": "...",
    "priority": "...",
    "assignees": [...],
    "clientId": "...",
    "projectId": "...",
    "deadline": "...",
    "description": "..."
  }
}
```

**Auth:** `x-webhook-secret: <OPENCLAW_WEBHOOK_SECRET>` header on every outgoing request.

### 3. OpenClaw Webhook Receiver (Oracle VM)

**File:** `~/clawd/webhook-receiver.js`
**Runtime:** Node.js, Express, port 3001
**Systemd service:** `openclaw-webhook.service`

Responsibilities:
- Validate `x-webhook-secret` header — reject with 401 if invalid
- On `task_assigned` event: POST a Slack message to `#tell-asty` channel with task details
- Return 200 on success, 4xx/5xx on failure

**Slack message format:**
```
📋 Task assigned to Asty
*[Task Title]* · [Priority] · [Status]
[Description if present]
```

## Data Flow

```
Web App / API client
    ↓ POST /tasks  or  PATCH /tasks/:id
Cloud Function (functions/index.js)
    ↓ Saves to Firestore
    ↓ Detects asty@publicknowledge.co in assignees
    ↓ Fire-and-forget POST to OPENCLAW_WEBHOOK_URL
Webhook Receiver (Oracle VM :3001)
    ↓ Validates secret
    ↓ Posts to #tell-asty via Slack Web API
Asty (OpenClaw, socket mode)
    ↓ Reads #tell-asty message and acts accordingly
```

## Post-Implementation Setup

Steps required after code is deployed:

1. Create `#tell-asty` Slack channel and invite Asty
2. Set Firebase secrets:
   ```
   firebase functions:secrets:set OPENCLAW_WEBHOOK_URL
   firebase functions:secrets:set OPENCLAW_WEBHOOK_SECRET
   ```
3. Open port 3001 on Oracle VM:
   - OCI Console → VCN → Security List → add ingress rule for TCP 3001
   - On VM: `sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT`
4. Deploy webhook receiver on Oracle VM and start systemd service
5. Deploy Cloud Functions: `firebase deploy --only functions`

## Task IDs

- Task #7: Add Asty to TEAM in config.js
- Task #8: Add webhook notification to Cloud Functions
- Task #9: Create webhook receiver service for Oracle VM
