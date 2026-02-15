/**
 * Cloud Functions API for Claude Slack Integration
 *
 * These endpoints allow Claude (acting as scrum master in Slack)
 * to read and write task data in Firestore.
 *
 * All endpoints require the x-api-key header matching the
 * CLAUDE_API_KEY environment variable set in Firebase.
 *
 * Set the key: firebase functions:config:set claude.apikey="your-secret-key"
 * Or for v2: firebase functions:secrets:set CLAUDE_API_KEY
 */

const { onRequest } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const admin = require('firebase-admin')

admin.initializeApp()
const db = admin.firestore()

const CLAUDE_API_KEY = defineSecret('CLAUDE_API_KEY')
const SLACK_WEBHOOK_URL = defineSecret('SLACK_WEBHOOK_URL')

// Auth middleware
function authenticate(req, res) {
  const key = req.headers['x-api-key']
  if (!key || key !== process.env.CLAUDE_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}

// CORS headers
function cors(res) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key')
}

// Helper to get assignees array from task (backward compat with single assignee)
function getAssignees(t) {
  if (t.assignees) return t.assignees
  return t.assignee ? [t.assignee] : []
}

/**
 * GET  /api/tasks          - List all tasks (optional filters: ?assignee=email&status=todo&clientId=x&projectId=x)
 * POST /api/tasks          - Create a task
 * PATCH /api/tasks/:id     - Update a task
 * DELETE /api/tasks/:id    - Delete a task
 */
exports.api = onRequest({ secrets: [CLAUDE_API_KEY] }, async (req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (!authenticate(req, res)) return

  const path = req.path.replace(/^\//, '').replace(/\/$/, '')
  const segments = path.split('/')

  try {
    // --- TASKS ---
    if (segments[0] === 'tasks') {
      if (req.method === 'GET' && segments.length === 1) {
        return await listTasks(req, res)
      }
      if (req.method === 'POST' && segments.length === 1) {
        return await createTask(req, res)
      }
      if (req.method === 'PATCH' && segments.length === 2) {
        return await updateTask(req, res, segments[1])
      }
      if (req.method === 'DELETE' && segments.length === 2) {
        return await deleteTask(req, res, segments[1])
      }
    }

    // --- SCRUM (daily summary) ---
    if (segments[0] === 'scrum' && req.method === 'GET') {
      return await scrumSummary(req, res)
    }

    // --- STANDUPS ---
    if (segments[0] === 'standups') {
      if (req.method === 'POST' && segments.length === 1) {
        return await createStandup(req, res)
      }
      if (req.method === 'GET' && segments.length === 1) {
        return await listStandups(req, res)
      }
    }

    // --- CLIENTS ---
    if (segments[0] === 'clients' && req.method === 'GET') {
      return await listClients(req, res)
    }

    // --- PROJECTS ---
    if (segments[0] === 'projects' && req.method === 'GET') {
      return await listProjects(req, res)
    }

    // --- PARSE NOTES ---
    if (segments[0] === 'notes' && req.method === 'POST') {
      return await addNote(req, res)
    }

    res.status(404).json({ error: 'Not found' })
  } catch (err) {
    console.error('API error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// === Task Handlers ===

async function listTasks(req, res) {
  let q = db.collection('tasks')

  if (req.query.assignee) q = q.where('assignees', 'array-contains', req.query.assignee)
  if (req.query.status) q = q.where('status', '==', req.query.status)
  if (req.query.clientId) q = q.where('clientId', '==', req.query.clientId)
  if (req.query.projectId) q = q.where('projectId', '==', req.query.projectId)

  const snap = await q.orderBy('updatedAt', 'desc').get()
  const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  res.json({ tasks })
}

async function createTask(req, res) {
  const data = req.body
  if (!data.title) return res.status(400).json({ error: 'title is required' })

  const assignees = data.assignees || (data.assignee ? [data.assignee] : [])

  const task = {
    title: data.title,
    description: data.description || '',
    clientId: data.clientId || '',
    projectId: data.projectId || '',
    assignees,
    status: data.status || 'todo',
    priority: data.priority || 'medium',
    deadline: data.deadline ? admin.firestore.Timestamp.fromDate(new Date(data.deadline)) : null,
    notes: data.notes || [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    closedAt: null,
    createdBy: data.createdBy || 'claude',
  }

  const ref = await db.collection('tasks').add(task)
  res.status(201).json({ id: ref.id, ...task })
}

async function updateTask(req, res, taskId) {
  const data = req.body
  const update = { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() }

  if (data.status === 'done') {
    update.closedAt = admin.firestore.FieldValue.serverTimestamp()
  } else if (data.status) {
    update.closedAt = null
  }

  if (data.deadline) {
    update.deadline = admin.firestore.Timestamp.fromDate(new Date(data.deadline))
  }

  await db.collection('tasks').doc(taskId).update(update)
  res.json({ id: taskId, updated: true })
}

async function deleteTask(req, res, taskId) {
  await db.collection('tasks').doc(taskId).delete()
  res.json({ id: taskId, deleted: true })
}

// === Scrum Summary ===
// Returns: items closed yesterday + currently open items per team member

async function scrumSummary(req, res) {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  // Items closed yesterday
  const closedSnap = await db
    .collection('tasks')
    .where('closedAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
    .where('closedAt', '<', admin.firestore.Timestamp.fromDate(today))
    .get()
  const closedYesterday = closedSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  // All open items (not done, not backlog)
  const openSnap = await db
    .collection('tasks')
    .where('status', 'in', ['todo', 'in_progress', 'review'])
    .get()
  const openTasks = openSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  // Group by assignee
  const team = ['gyan', 'charu', 'sharang', 'anandu']
  const summary = {}
  for (const name of team) {
    const email = `${name}@publicknowledge.co`
    summary[name] = {
      closedYesterday: closedYesterday.filter((t) => getAssignees(t).includes(email)),
      open: openTasks.filter((t) => getAssignees(t).includes(email)),
    }
  }

  // Unassigned
  summary['unassigned'] = {
    closedYesterday: closedYesterday.filter((t) => getAssignees(t).length === 0),
    open: openTasks.filter((t) => getAssignees(t).length === 0),
  }

  res.json({ date: now.toISOString().split('T')[0], summary })
}

// === Standup Handlers ===

async function createStandup(req, res) {
  const data = req.body
  const standup = {
    userEmail: data.userEmail,
    userName: data.userName || '',
    yesterday: data.yesterday || '',
    today: data.today || '',
    blockers: data.blockers || '',
    date: admin.firestore.FieldValue.serverTimestamp(),
  }

  const ref = await db.collection('standups').add(standup)
  res.status(201).json({ id: ref.id })
}

async function listStandups(req, res) {
  let q = db.collection('standups').orderBy('date', 'desc').limit(20)
  if (req.query.userEmail) q = q.where('userEmail', '==', req.query.userEmail)

  const snap = await q.get()
  const standups = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  res.json({ standups })
}

// === Reference Data ===

async function listClients(req, res) {
  const snap = await db.collection('clients').orderBy('name').get()
  res.json({ clients: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })
}

async function listProjects(req, res) {
  const snap = await db.collection('projects').orderBy('name').get()
  res.json({ projects: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })
}

// === Notes (Granola / meeting notes) ===

async function addNote(req, res) {
  const data = req.body
  const note = {
    content: data.content || '',
    source: data.source || 'slack',
    taskIds: data.taskIds || [],
    createdBy: data.createdBy || 'claude',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }

  const ref = await db.collection('notes').add(note)
  res.status(201).json({ id: ref.id })
}

// === Slack Bot (Events API — interactive @mentions) ===
exports.slack = require('./slack').slack

// =============================================================
// Slack Workflow Webhook Endpoint
// =============================================================
// Accepts POST requests from Slack Workflow Builder and posts
// formatted responses back to Slack via incoming webhook.
//
// Actions:
//   { "action": "scrum" }                    — Post daily scrum summary
//   { "action": "standup", "userEmail", "userName", "yesterday", "today", "blockers" }
//   { "action": "create_task", "title", "assignee", "status", "priority", "clientId", "projectId" }

exports.slackWebhook = onRequest(
  { secrets: [CLAUDE_API_KEY, SLACK_WEBHOOK_URL] },
  async (req, res) => {
    cors(res)
    if (req.method === 'OPTIONS') return res.status(204).send('')
    // Authenticate with same API key
    if (!authenticate(req, res)) return

    const { action } = req.body
    if (!action) return res.status(400).json({ error: 'action is required' })

    try {
      let slackMessage

      if (action === 'scrum') {
        slackMessage = await buildScrumMessage()
      } else if (action === 'standup') {
        slackMessage = await handleStandupWebhook(req.body)
      } else if (action === 'create_task') {
        slackMessage = await handleCreateTaskWebhook(req.body)
      } else {
        return res.status(400).json({ error: `Unknown action: ${action}` })
      }

      // Post to Slack
      const webhookUrl = process.env.SLACK_WEBHOOK_URL
      if (webhookUrl) {
        await postToSlack(webhookUrl, slackMessage)
      }

      res.json({ ok: true, message: slackMessage })
    } catch (err) {
      console.error('Slack webhook error:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

async function postToSlack(webhookUrl, text) {
  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) {
    console.error('Slack webhook failed:', resp.status, await resp.text())
  }
}

async function buildScrumMessage() {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const closedSnap = await db
    .collection('tasks')
    .where('closedAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
    .where('closedAt', '<', admin.firestore.Timestamp.fromDate(today))
    .get()
  const closedYesterday = closedSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  const openSnap = await db
    .collection('tasks')
    .where('status', 'in', ['todo', 'in_progress', 'review'])
    .get()
  const openTasks = openSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  const team = ['gyan', 'charu', 'sharang', 'anandu']
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })

  let msg = `📋 *Daily Scrum — ${dateStr}*\n\n`

  // Closed yesterday
  msg += `*✅ Closed Yesterday:*\n`
  let anyClosed = false
  for (const name of team) {
    const email = `${name}@publicknowledge.co`
    const closed = closedYesterday.filter((t) => getAssignees(t).includes(email))
    const displayName = name.charAt(0).toUpperCase() + name.slice(1)
    if (closed.length > 0) {
      msg += `  ${displayName}: ${closed.map((t) => t.title).join(', ')}\n`
      anyClosed = true
    } else {
      msg += `  ${displayName}: —\n`
    }
  }
  if (!anyClosed) msg += `  _No tasks closed yesterday_\n`

  msg += `\n*📌 Currently Open:*\n`
  for (const name of team) {
    const email = `${name}@publicknowledge.co`
    const open = openTasks.filter((t) => getAssignees(t).includes(email))
    const displayName = name.charAt(0).toUpperCase() + name.slice(1)
    if (open.length > 0) {
      msg += `  *${displayName}* (${open.length} task${open.length > 1 ? 's' : ''}):\n`
      for (const t of open) {
        const statusLabel = t.status === 'in_progress' ? 'In Progress' : t.status === 'todo' ? 'To Do' : 'Review'
        msg += `    • [${statusLabel}] ${t.title}\n`
      }
    } else {
      msg += `  *${displayName}*: _No open tasks_\n`
    }
  }

  const unassigned = openTasks.filter((t) => getAssignees(t).length === 0)
  if (unassigned.length > 0) {
    msg += `  *Unassigned* (${unassigned.length}):\n`
    for (const t of unassigned) {
      msg += `    • [${t.status}] ${t.title}\n`
    }
  }

  return msg
}

async function handleStandupWebhook(data) {
  const standup = {
    userEmail: data.userEmail,
    userName: data.userName || '',
    yesterday: data.yesterday || '',
    today: data.today || '',
    blockers: data.blockers || '',
    date: admin.firestore.FieldValue.serverTimestamp(),
  }

  await db.collection('standups').add(standup)

  let msg = `🧍 *Standup from ${standup.userName || standup.userEmail}*\n`
  msg += `*Yesterday:* ${standup.yesterday || '_nothing_'}\n`
  msg += `*Today:* ${standup.today || '_nothing_'}\n`
  if (standup.blockers) msg += `*🚧 Blockers:* ${standup.blockers}\n`
  return msg
}

async function handleCreateTaskWebhook(data) {
  if (!data.title) return '❌ Task title is required'

  const assignees = data.assignees || (data.assignee ? [data.assignee] : [])

  const task = {
    title: data.title,
    description: data.description || '',
    clientId: data.clientId || '',
    projectId: data.projectId || '',
    assignees,
    status: data.status || 'todo',
    priority: data.priority || 'medium',
    deadline: data.deadline ? admin.firestore.Timestamp.fromDate(new Date(data.deadline)) : null,
    notes: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    closedAt: null,
    createdBy: data.createdBy || 'slack-workflow',
  }

  const ref = await db.collection('tasks').add(task)
  const assigneeStr = assignees.length > 0 ? ` → ${assignees.join(', ')}` : ''
  return `✅ Task created: *${task.title}*${assigneeStr} (${task.status}, ${task.priority} priority)`
}
