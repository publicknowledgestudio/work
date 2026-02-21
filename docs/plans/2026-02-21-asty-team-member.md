# Asty as Team Member Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Asty (AI studio manager) to the team in work.publicknowledge.co so tasks can be assigned to it, and fire a webhook to the Oracle VM whenever Asty is assigned a task, which then posts to `#tell-asty` in Slack.

**Architecture:** Three-part change: (1) one-line config change in the frontend, (2) webhook notification in Cloud Functions triggered on task create/update when Asty is in assignees, (3) a standalone Express webhook receiver on the Oracle VM that posts to `#tell-asty` via Slack Web API.

**Tech Stack:** Vanilla JS (frontend), Firebase Cloud Functions v2 / Node 22 (backend), Express.js on Oracle VM (webhook receiver), Slack Web API (notifications)

---

### Task 1: Add Asty to TEAM in `src/config.js`

**Files:**
- Modify: `src/config.js:14-19`

**Step 1: Edit the TEAM array**

In `src/config.js`, add Asty as the last entry in the `TEAM` array:

```js
export const TEAM = [
  { email: 'gyan@publicknowledge.co', name: 'Gyan', color: '#4f46e5' },
  { email: 'charu@publicknowledge.co', name: 'Charu', color: '#0891b2' },
  { email: 'sharang@publicknowledge.co', name: 'Sharang', color: '#c026d3' },
  { email: 'anandu@publicknowledge.co', name: 'Anandu', color: '#ea580c' },
  { email: 'asty@publicknowledge.co', name: 'Asty', color: '#10b981' },
]
```

**Step 2: Verify it looks right**

Run the dev server and check that:
- `npm run dev` starts on port 3000 without errors
- The "By Assignee" board view shows an "Asty" column
- The task modal's assignee picker shows Asty with a teal "A" avatar
- Typing `@asty` in the quick-add input shows Asty in the dropdown

**Step 3: Commit**

```bash
git add src/config.js
git commit -m "feat: add Asty as team member (asty@publicknowledge.co)"
```

---

### Task 2: Add webhook secrets and helper to Cloud Functions

**Files:**
- Modify: `functions/index.js:21-22` (add new secrets)
- Modify: `functions/index.js:53` (add secrets to `exports.api`)

**Step 1: Define the two new secrets at the top of `functions/index.js`**

After line 22 (`const SLACK_WEBHOOK_URL = defineSecret('SLACK_WEBHOOK_URL')`), add:

```js
const OPENCLAW_WEBHOOK_URL = defineSecret('OPENCLAW_WEBHOOK_URL')
const OPENCLAW_WEBHOOK_SECRET = defineSecret('OPENCLAW_WEBHOOK_SECRET')
```

**Step 2: Add the secrets to the `exports.api` onRequest declaration**

Change:
```js
exports.api = onRequest({ secrets: [CLAUDE_API_KEY] }, async (req, res) => {
```
To:
```js
exports.api = onRequest(
  { secrets: [CLAUDE_API_KEY, OPENCLAW_WEBHOOK_URL, OPENCLAW_WEBHOOK_SECRET] },
  async (req, res) => {
```

**Step 3: Add the `notifyOpenClaw` helper function**

Add this function after the `deleteTask` function (around line 208), before the `// === Scrum Summary ===` comment:

```js
// === OpenClaw Webhook ===

const ASTY_EMAIL = 'asty@publicknowledge.co'

function notifyOpenClaw(taskId, task, action) {
  const webhookUrl = process.env.OPENCLAW_WEBHOOK_URL
  const webhookSecret = process.env.OPENCLAW_WEBHOOK_SECRET
  if (!webhookUrl) return // not configured yet — skip silently

  const payload = {
    event: 'task_assigned',
    action,
    task: { id: taskId, ...task },
  }

  // Fire and forget — do not await, do not block the response
  fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': webhookSecret || '',
    },
    body: JSON.stringify(payload),
  }).catch((err) => console.error('OpenClaw webhook error:', err))
}
```

**Step 4: Commit**

```bash
git add functions/index.js
git commit -m "feat: define OpenClaw webhook secrets and helper in Cloud Functions"
```

---

### Task 3: Call `notifyOpenClaw` in `createTask` and `updateTask`

**Files:**
- Modify: `functions/index.js` — `createTask` function (~line 161) and `updateTask` function (~line 187)

**Step 1: Add the notify call to `createTask`**

After `const ref = await db.collection('tasks').add(task)` (currently `res.status(201).json(...)`), add the notification call before the response:

```js
  const ref = await db.collection('tasks').add(task)

  if (assignees.includes(ASTY_EMAIL)) {
    notifyOpenClaw(ref.id, task, 'created')
  }

  res.status(201).json({ id: ref.id, ...task })
```

**Step 2: Add the notify call to `updateTask`**

After `await db.collection('tasks').doc(taskId).update(update)`, add:

```js
  await db.collection('tasks').doc(taskId).update(update)

  const newAssignees = data.assignees || []
  if (newAssignees.includes(ASTY_EMAIL)) {
    notifyOpenClaw(taskId, { ...data, updatedAt: new Date().toISOString() }, 'updated')
  }

  res.json({ id: taskId, updated: true })
```

**Step 3: Verify the code looks correct**

Review the two modified functions. The `createTask` check uses `assignees` (already computed earlier in the function). The `updateTask` check uses `data.assignees` — this fires only when the update payload explicitly includes an `assignees` field that contains Asty.

**Step 4: Commit**

```bash
git add functions/index.js
git commit -m "feat: notify OpenClaw webhook when Asty is assigned a task"
```

---

### Task 4: Create the webhook receiver on the Oracle VM

**File to create:** `~/clawd/webhook-receiver.js` — run this on the Oracle VM via SSH.

**Step 1: SSH into the Oracle VM and check Node version**

```bash
ssh <oracle-vm>
node --version
# Expected: v18+ (ideally v20 or v22)
```

**Step 2: Install Express in the clawd workspace**

```bash
cd ~/clawd
npm init -y   # if no package.json exists yet
npm install express
```

**Step 3: Create `~/clawd/webhook-receiver.js`**

```js
const express = require('express')
const app = express()
app.use(express.json())

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ''
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || ''
const TELL_ASTY_CHANNEL = process.env.TELL_ASTY_CHANNEL || '#tell-asty'
const PORT = process.env.PORT || 3001

app.post('/webhook', async (req, res) => {
  // Validate secret
  const secret = req.headers['x-webhook-secret']
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    console.warn('Rejected webhook: invalid secret')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { event, action, task } = req.body
  if (event !== 'task_assigned' || !task) {
    return res.status(400).json({ error: 'Invalid payload' })
  }

  console.log(`[webhook] ${action} task: ${task.id} — ${task.title}`)

  // Post to #tell-asty
  if (SLACK_BOT_TOKEN) {
    const priorityEmoji = task.priority === 'urgent' ? '🔥' : task.priority === 'high' ? '⚠️' : ''
    const statusLabel = {
      todo: 'To Do',
      in_progress: 'In Progress',
      review: 'Review',
      backlog: 'Backlog',
      done: 'Done',
    }[task.status] || task.status

    const lines = [
      `📋 *Task ${action} — assigned to Asty*`,
      `*${task.title}*`,
      `${priorityEmoji} ${statusLabel} · ${task.priority || 'medium'} priority`,
    ]
    if (task.description) lines.push(task.description)

    await postToSlack(TELL_ASTY_CHANNEL, lines.join('\n'))
  }

  res.json({ ok: true })
})

async function postToSlack(channel, text) {
  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel, text }),
  })
  const data = await resp.json()
  if (!data.ok) console.error('Slack post failed:', data.error)
}

app.listen(PORT, () => {
  console.log(`OpenClaw webhook receiver listening on :${PORT}`)
})
```

**Step 4: Test it manually**

In one terminal, start the server:
```bash
WEBHOOK_SECRET=test123 node ~/clawd/webhook-receiver.js
```

In another terminal, send a test request:
```bash
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: test123" \
  -d '{"event":"task_assigned","action":"created","task":{"id":"test1","title":"Test task","status":"todo","priority":"medium"}}'
# Expected: {"ok":true}
```

---

### Task 5: Create the systemd service for the webhook receiver

**File to create:** `/etc/systemd/system/openclaw-webhook.service` — on the Oracle VM.

**Step 1: Create the service file**

```bash
sudo tee /etc/systemd/system/openclaw-webhook.service > /dev/null <<'EOF'
[Unit]
Description=OpenClaw Webhook Receiver
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/clawd
ExecStart=/usr/bin/node /home/ubuntu/clawd/webhook-receiver.js
Restart=always
RestartSec=5
Environment=PORT=3001
Environment=WEBHOOK_SECRET=<set-this>
Environment=SLACK_BOT_TOKEN=<paste-from-openclaw.json>
Environment=TELL_ASTY_CHANNEL=<channel-id-for-tell-asty>

[Install]
WantedBy=multi-user.target
EOF
```

Replace:
- `<set-this>` with the same value you'll set as `OPENCLAW_WEBHOOK_SECRET` in Firebase
- `<paste-from-openclaw.json>` with the `botToken` from `~/.openclaw/openclaw.json`
- `<channel-id-for-tell-asty>` with the Slack channel ID of `#tell-asty` (starts with `C`)

To find the channel ID: right-click the channel in Slack → View channel details → scroll down to find the ID.

**Step 2: Enable and start the service**

```bash
sudo systemctl daemon-reload
sudo systemctl enable openclaw-webhook
sudo systemctl start openclaw-webhook
sudo systemctl status openclaw-webhook
# Expected: Active: active (running)
```

**Step 3: Check logs**

```bash
journalctl -u openclaw-webhook -f
# Expected: "OpenClaw webhook receiver listening on :3001"
```

---

### Task 6: Open port 3001 on Oracle VM

**Step 1: Add iptables rule**

```bash
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

**Step 2: Open in OCI security list**

In OCI Console:
1. Go to Networking → Virtual Cloud Networks → your VCN
2. Click Security Lists → Default Security List
3. Add Ingress Rule:
   - Source CIDR: `0.0.0.0/0`
   - Protocol: TCP
   - Destination Port: `3001`

**Step 3: Verify from outside the VM**

From your Mac:
```bash
curl -X POST http://<VM_PUBLIC_IP>:3001/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: <your-secret>" \
  -d '{"event":"task_assigned","action":"created","task":{"id":"test","title":"Hello from Cloud","status":"todo","priority":"low"}}'
# Expected: {"ok":true}  and #tell-asty shows the Slack message
```

---

### Task 7: Set Firebase secrets and deploy

**Step 1: Set the two new Firebase secrets**

```bash
firebase functions:secrets:set OPENCLAW_WEBHOOK_URL
# Paste: http://<VM_PUBLIC_IP>:3001/webhook

firebase functions:secrets:set OPENCLAW_WEBHOOK_SECRET
# Paste: <your-shared-secret>
```

**Step 2: Deploy Cloud Functions**

```bash
firebase deploy --only functions
# Expected: ✔  functions[api(us-central1)] Successful update
```

**Step 3: Deploy frontend**

```bash
npm run deploy
# or: firebase deploy --only hosting
```

**Step 4: End-to-end test**

1. Open work.publicknowledge.co
2. Create a new task and assign it to Asty
3. Check `#tell-asty` in Slack — should see a message within seconds
4. Update an existing task's assignees to include Asty — check `#tell-asty` again

---

## Post-Deployment Checklist

- [ ] `#tell-asty` channel created and Asty invited
- [ ] `OPENCLAW_WEBHOOK_URL` Firebase secret set
- [ ] `OPENCLAW_WEBHOOK_SECRET` Firebase secret set
- [ ] Webhook receiver running on Oracle VM (`systemctl status openclaw-webhook`)
- [ ] Port 3001 open in OCI security list
- [ ] Cloud Functions deployed
- [ ] Frontend deployed
- [ ] End-to-end test passed (assign Asty → Slack message appears)
