/**
 * Slack Bot — Claude Scrum Master
 *
 * Handles Slack Events API callbacks (app_mention) and routes
 * commands to the appropriate handler. Reads/writes directly
 * to Firestore (same project, already initialized by index.js).
 *
 * Required secrets (set via Firebase):
 *   firebase functions:secrets:set SLACK_BOT_TOKEN
 *   firebase functions:secrets:set SLACK_SIGNING_SECRET
 *
 * Slack app setup:
 *   Event Subscriptions → Request URL: https://<region>-<project>.cloudfunctions.net/slack
 *   Subscribe to bot events: app_mention
 *   Bot Token Scopes: chat:write, app_mentions:read, users:read
 */

const { onRequest } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const admin = require('firebase-admin')
const crypto = require('crypto')

const SLACK_BOT_TOKEN = defineSecret('SLACK_BOT_TOKEN')
const SLACK_SIGNING_SECRET = defineSecret('SLACK_SIGNING_SECRET')

// Firestore is already initialized by index.js (same entry point)
const db = admin.firestore()

// ── Team members ──────────────────────────────────────────────

const TEAM = {
  gyan: { email: 'gyan@publicknowledge.co', name: 'Gyan' },
  charu: { email: 'charu@publicknowledge.co', name: 'Charu' },
  sharang: { email: 'sharang@publicknowledge.co', name: 'Sharang' },
  anandu: { email: 'anandu@publicknowledge.co', name: 'Anandu' },
}

const STATUS_MAP = {
  backlog: 'backlog',
  'to do': 'todo',
  todo: 'todo',
  'in progress': 'in_progress',
  'in-progress': 'in_progress',
  progress: 'in_progress',
  review: 'review',
  done: 'done',
  complete: 'done',
  completed: 'done',
  finished: 'done',
}

const STATUS_LABEL = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
}

const STATUS_EMOJI = {
  backlog: ':file_cabinet:',
  todo: ':clipboard:',
  in_progress: ':hammer_and_wrench:',
  review: ':mag:',
  done: ':white_check_mark:',
}

// ── Helpers ───────────────────────────────────────────────────

// Backward compat: tasks may have `assignee` (string) or `assignees` (array)
function getAssignees(t) {
  if (t.assignees) return t.assignees
  return t.assignee ? [t.assignee] : []
}

function verifySignature(rawBody, timestamp, signature, secret) {
  if (!timestamp || !signature) return false
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - parseInt(timestamp)) > 300) return false

  const base = `v0:${timestamp}:${rawBody}`
  const computed =
    'v0=' +
    crypto.createHmac('sha256', secret).update(base, 'utf8').digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
  } catch {
    return false
  }
}

async function postMessage(channel, text, token, threadTs) {
  const payload = { channel, text }
  if (threadTs) payload.thread_ts = threadTs

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!data.ok) console.error('Slack API error:', data.error)
  return data
}

function findTeamMember(text) {
  const lower = text.toLowerCase()
  for (const [key, member] of Object.entries(TEAM)) {
    if (lower.includes(key)) return member
  }
  return null
}

function findStatus(text) {
  const lower = text.toLowerCase()
  // Check longer phrases first to avoid partial matches
  const ordered = Object.entries(STATUS_MAP).sort(
    (a, b) => b[0].length - a[0].length
  )
  for (const [key, value] of ordered) {
    if (lower.includes(key)) return value
  }
  return null
}

async function findTaskByTitle(searchText) {
  if (!searchText || searchText.length < 2) return null

  const snap = await db
    .collection('tasks')
    .where('status', 'in', ['backlog', 'todo', 'in_progress', 'review'])
    .get()

  const lower = searchText.toLowerCase()
  const matches = snap.docs.filter((d) =>
    d.data().title.toLowerCase().includes(lower)
  )

  if (matches.length === 1) return { id: matches[0].id, ...matches[0].data() }
  if (matches.length > 1)
    return matches.map((d) => ({ id: d.id, ...d.data() }))
  return null
}

async function resolveSlackUser(userId, token) {
  try {
    const res = await fetch(
      `https://slack.com/api/users.info?user=${userId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    if (!data.ok) return null

    const name = (
      data.user.real_name ||
      data.user.profile.display_name ||
      ''
    ).toLowerCase()
    for (const [key, member] of Object.entries(TEAM)) {
      if (name.includes(key)) return member
    }
    // Try email match
    const email = data.user.profile.email || ''
    for (const member of Object.values(TEAM)) {
      if (email === member.email) return member
    }
    return { email, name: data.user.real_name || data.user.name || 'Unknown' }
  } catch {
    return null
  }
}

// ── Command Handlers ──────────────────────────────────────────

async function handleScrum(channel, token, threadTs) {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const closedSnap = await db
    .collection('tasks')
    .where('closedAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
    .where('closedAt', '<', admin.firestore.Timestamp.fromDate(todayStart))
    .get()
  const closedTasks = closedSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  const openSnap = await db
    .collection('tasks')
    .where('status', 'in', ['todo', 'in_progress', 'review'])
    .get()
  const openTasks = openSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  let text = `:clipboard: *Daily Scrum \u2014 ${dateStr}*\n\n`

  // Closed yesterday
  text += `:white_check_mark: *Closed Yesterday:*\n`
  let hasClosed = false
  for (const [, member] of Object.entries(TEAM)) {
    const tasks = closedTasks.filter((t) => getAssignees(t).includes(member.email))
    if (tasks.length > 0) {
      hasClosed = true
      text += `  ${member.name}: ${tasks.map((t) => t.title).join(', ')}\n`
    }
  }
  if (!hasClosed) text += `  _No tasks closed yesterday_\n`

  // Open tasks per person
  text += `\n:pushpin: *Currently Open:*\n`
  for (const [, member] of Object.entries(TEAM)) {
    const tasks = openTasks.filter((t) => getAssignees(t).includes(member.email))
    if (tasks.length > 0) {
      text += `  *${member.name}* (${tasks.length} task${tasks.length > 1 ? 's' : ''}):\n`
      for (const t of tasks) {
        text += `    \u2022 [${STATUS_LABEL[t.status] || t.status}] ${t.title}\n`
      }
    } else {
      text += `  *${member.name}*: _No open tasks_\n`
    }
  }

  // Unassigned
  const unassigned = openTasks.filter((t) => getAssignees(t).length === 0)
  if (unassigned.length > 0) {
    text += `  *Unassigned* (${unassigned.length}):\n`
    for (const t of unassigned) {
      text += `    \u2022 [${STATUS_LABEL[t.status] || t.status}] ${t.title}\n`
    }
  }

  await postMessage(channel, text, token, threadTs)
}

async function handleCreateTask(text, channel, token, threadTs) {
  // Try several patterns to extract the title
  let title = null
  const quoted = text.match(/["\u201C\u201D]([^"\u201C\u201D]+)["\u201C\u201D]/)
  if (quoted) {
    title = quoted[1].trim()
  } else {
    const after = text.match(
      /(?:create|add|new)\s+(?:a\s+)?task\s*:?\s*(.+?)(?:\s+for\s+\w|\s+assign|\s+priority|\s+deadline|\s+client|$)/i
    )
    if (after) title = after[1].trim()
  }

  if (!title) {
    await postMessage(
      channel,
      ':x: I couldn\'t parse the task title. Try: `create task "Your task title"`',
      token,
      threadTs
    )
    return
  }

  const member = findTeamMember(text)
  const priorityMatch = text.match(/priority\s+(low|medium|high|urgent)/i)
  const deadlineMatch = text.match(/deadline\s+(\S+)/i)

  const task = {
    title,
    description: '',
    assignees: member ? [member.email] : [],
    status: 'todo',
    priority: priorityMatch ? priorityMatch[1].toLowerCase() : 'medium',
    deadline: deadlineMatch
      ? admin.firestore.Timestamp.fromDate(new Date(deadlineMatch[1]))
      : null,
    clientId: '',
    projectId: '',
    notes: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    closedAt: null,
    createdBy: 'claude-slack',
  }

  // Try to match client name from message
  const clientsSnap = await db.collection('clients').get()
  for (const doc of clientsSnap.docs) {
    if (text.toLowerCase().includes(doc.data().name.toLowerCase())) {
      task.clientId = doc.id
      break
    }
  }

  const ref = await db.collection('tasks').add(task)

  let response = `:heavy_plus_sign: *Task created:* ${title}\n`
  response += `  ID: \`${ref.id}\`\n`
  if (member) response += `  Assignee: ${member.name}\n`
  if (priorityMatch) response += `  Priority: ${priorityMatch[1]}\n`
  if (deadlineMatch) response += `  Deadline: ${deadlineMatch[1]}\n`
  if (task.clientId) {
    const client = clientsSnap.docs.find((d) => d.id === task.clientId)
    if (client) response += `  Client: ${client.data().name}\n`
  }

  await postMessage(channel, response, token, threadTs)
}

async function handleAssign(text, channel, token, threadTs) {
  const member = findTeamMember(text)
  if (!member) {
    await postMessage(
      channel,
      `:x: Couldn't find a team member. Known members: ${Object.values(TEAM)
        .map((m) => m.name)
        .join(', ')}`,
      token,
      threadTs
    )
    return
  }

  // Extract the task reference by stripping command words
  const taskText = text
    .replace(/assign\s*/i, '')
    .replace(/to\s+\w+\s*/i, '')
    .replace(/\bthe\b/gi, '')
    .replace(/\btask\b/gi, '')
    .trim()

  const result = await findTaskByTitle(taskText)

  if (!result) {
    await postMessage(
      channel,
      `:x: Couldn't find a task matching "${taskText}".`,
      token,
      threadTs
    )
    return
  }
  if (Array.isArray(result)) {
    const list = result
      .slice(0, 5)
      .map((t) => `  \u2022 ${t.title} (\`${t.id}\`)`)
      .join('\n')
    await postMessage(
      channel,
      `:thinking_face: Multiple tasks match. Which one?\n${list}`,
      token,
      threadTs
    )
    return
  }

  await db.collection('tasks').doc(result.id).update({
    assignees: [member.email],
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  await postMessage(
    channel,
    `:white_check_mark: Assigned *${result.title}* to ${member.name}`,
    token,
    threadTs
  )
}

async function handleMove(text, channel, token, threadTs) {
  const status = findStatus(text)
  if (!status) {
    await postMessage(
      channel,
      ':x: Couldn\'t determine the target status. Use: `to do`, `in progress`, `review`, `done`, `backlog`',
      token,
      threadTs
    )
    return
  }

  // Strip command words and status words to find the task name
  const taskText = text
    .replace(/^(move|mark|set)\s+/i, '')
    .replace(
      /\s+(to|as)\s+(backlog|to\s*do|todo|in[\s-]?progress|review|done|complete[d]?|finished)\s*/i,
      ''
    )
    .replace(/\bthe\b/gi, '')
    .replace(/\btask\b/gi, '')
    .trim()

  const result = await findTaskByTitle(taskText)

  if (!result) {
    await postMessage(
      channel,
      `:x: Couldn't find a task matching "${taskText}".`,
      token,
      threadTs
    )
    return
  }
  if (Array.isArray(result)) {
    const list = result
      .slice(0, 5)
      .map((t) => `  \u2022 ${t.title} (\`${t.id}\`)`)
      .join('\n')
    await postMessage(
      channel,
      `:thinking_face: Multiple tasks match. Which one?\n${list}`,
      token,
      threadTs
    )
    return
  }

  const update = {
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
  if (status === 'done') {
    update.closedAt = admin.firestore.FieldValue.serverTimestamp()
  } else {
    update.closedAt = null
  }

  await db.collection('tasks').doc(result.id).update(update)

  const emoji = STATUS_EMOJI[status] || ':arrows_counterclockwise:'
  await postMessage(
    channel,
    `${emoji} Moved *${result.title}* to *${STATUS_LABEL[status]}*`,
    token,
    threadTs
  )
}

async function handleListTasks(text, channel, userId, token, threadTs) {
  // Check if asking about themselves ("my tasks", "what am I working on")
  const askingSelf =
    /\b(my|me|i am|i'm)\b/i.test(text) || /what am i/i.test(text)
  let member = findTeamMember(text)

  if (!member && askingSelf) {
    member = await resolveSlackUser(userId, token)
  }

  let q = db
    .collection('tasks')
    .where('status', 'in', ['todo', 'in_progress', 'review'])
  if (member) {
    q = q.where('assignees', 'array-contains', member.email)
  }

  const snap = await q.get()
  const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

  if (tasks.length === 0) {
    const who = member ? member.name : 'the team'
    await postMessage(
      channel,
      `:sparkles: No open tasks for ${who}!`,
      token,
      threadTs
    )
    return
  }

  const who = member ? member.name : 'Everyone'
  let response = `:clipboard: *Open tasks for ${who}:*\n`
  for (const task of tasks) {
    const label = STATUS_LABEL[task.status] || task.status
    const emoji = STATUS_EMOJI[task.status] || ''
    const taskAssignees = getAssignees(task)
    const assigneeName = member
      ? ''
      : ` \u2014 ${taskAssignees.map((e) => Object.values(TEAM).find((m) => m.email === e)?.name).filter(Boolean).join(', ') || 'Unassigned'}`
    response += `  ${emoji} [${label}] ${task.title}${assigneeName}\n`
  }

  await postMessage(channel, response, token, threadTs)
}

async function handleStandup(text, channel, userId, token, threadTs) {
  const yesterdayMatch = text.match(
    /yesterday[:\s]+(.+?)(?=\btoday[:\s]|\bblockers?[:\s]|$)/is
  )
  const todayMatch = text.match(
    /today[:\s]+(.+?)(?=\bblockers?[:\s]|$)/is
  )
  const blockersMatch = text.match(/blockers?[:\s]+(.+)$/is)

  if (!yesterdayMatch && !todayMatch) {
    await postMessage(
      channel,
      ':memo: To submit a standup, use this format:\n`@claude standup yesterday: did X today: doing Y blockers: stuck on Z`',
      token,
      threadTs
    )
    return
  }

  const member = await resolveSlackUser(userId, token)
  const standup = {
    userEmail: member ? member.email : userId,
    userName: member ? member.name : 'Unknown',
    yesterday: yesterdayMatch ? yesterdayMatch[1].trim() : '',
    today: todayMatch ? todayMatch[1].trim() : '',
    blockers: blockersMatch ? blockersMatch[1].trim() : '',
    date: admin.firestore.FieldValue.serverTimestamp(),
  }

  await db.collection('standups').add(standup)

  let response = `:white_check_mark: *Standup recorded${member ? ` for ${member.name}` : ''}!*\n`
  if (standup.yesterday) response += `  *Yesterday:* ${standup.yesterday}\n`
  if (standup.today) response += `  *Today:* ${standup.today}\n`
  if (standup.blockers) response += `  *Blockers:* ${standup.blockers}\n`

  await postMessage(channel, response, token, threadTs)
}

async function handleAddNote(text, channel, token, threadTs) {
  // Pattern: "add note to <task>: <note text>" or "note on <task>: <note text>"
  const match = text.match(
    /(?:add\s+(?:a\s+)?note\s+(?:to|on)|note\s+(?:to|on))\s+(.+?):\s+(.+)/i
  )
  if (!match) {
    await postMessage(
      channel,
      ':x: Try: `add note to <task name>: your note here`',
      token,
      threadTs
    )
    return
  }

  const taskSearch = match[1].trim()
  const noteText = match[2].trim()
  const result = await findTaskByTitle(taskSearch)

  if (!result) {
    await postMessage(
      channel,
      `:x: Couldn't find a task matching "${taskSearch}".`,
      token,
      threadTs
    )
    return
  }
  if (Array.isArray(result)) {
    const list = result
      .slice(0, 5)
      .map((t) => `  \u2022 ${t.title} (\`${t.id}\`)`)
      .join('\n')
    await postMessage(
      channel,
      `:thinking_face: Multiple tasks match. Which one?\n${list}`,
      token,
      threadTs
    )
    return
  }

  const note = {
    text: noteText,
    author: 'claude-slack',
    timestamp: new Date().toISOString(),
  }
  const existingNotes = result.notes || []
  existingNotes.push(note)

  await db.collection('tasks').doc(result.id).update({
    notes: existingNotes,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  await postMessage(
    channel,
    `:memo: Added note to *${result.title}*:\n> ${noteText}`,
    token,
    threadTs
  )
}

async function handleHelp(channel, token, threadTs) {
  const text =
    `:wave: *Hi! I'm your Scrum Master.* Here's what I can do:\n\n` +
    `\u2022 \`@claude scrum\` \u2014 Daily scrum summary\n` +
    `\u2022 \`@claude create task "Title" for Gyan\` \u2014 Create a new task\n` +
    `\u2022 \`@claude assign <task> to <person>\` \u2014 Assign a task\n` +
    `\u2022 \`@claude move <task> to <status>\` \u2014 Update task status\n` +
    `\u2022 \`@claude what's <person> working on?\` \u2014 List someone's tasks\n` +
    `\u2022 \`@claude tasks\` \u2014 List all open tasks\n` +
    `\u2022 \`@claude add note to <task>: <note>\` \u2014 Add a note\n` +
    `\u2022 \`@claude standup yesterday: X today: Y blockers: Z\` \u2014 Submit standup\n` +
    `\u2022 \`@claude help\` \u2014 Show this message\n\n` +
    `_Statuses: backlog, to do, in progress, review, done_\n` +
    `_Team: Gyan, Charu, Sharang, Anandu_`

  await postMessage(channel, text, token, threadTs)
}

// ── Command Router ────────────────────────────────────────────

async function routeCommand(text, channel, userId, token, threadTs) {
  const lower = text.toLowerCase().trim()

  if (
    lower === 'scrum' ||
    lower === 'daily scrum' ||
    lower === 'standup summary'
  ) {
    return handleScrum(channel, token, threadTs)
  }

  if (lower === 'help' || lower === 'hi' || lower === 'hello') {
    return handleHelp(channel, token, threadTs)
  }

  if (/^(create|add|new)\s+(a\s+)?task/i.test(lower)) {
    return handleCreateTask(text, channel, token, threadTs)
  }

  if (/^assign\b/i.test(lower)) {
    return handleAssign(text, channel, token, threadTs)
  }

  if (/^(move|mark|set)\b/i.test(lower)) {
    return handleMove(text, channel, token, threadTs)
  }

  if (/^(add\s+(a\s+)?note|note\s+(to|on))\b/i.test(lower)) {
    return handleAddNote(text, channel, token, threadTs)
  }

  if (
    /^standup\b/i.test(lower) ||
    /^stand[\s-]up\b/i.test(lower)
  ) {
    return handleStandup(text, channel, userId, token, threadTs)
  }

  if (
    /working on/i.test(lower) ||
    /tasks?\s+for/i.test(lower) ||
    lower === 'tasks' ||
    lower === 'list tasks' ||
    /^(what'?s|what\s+is|show|list)\b/i.test(lower) ||
    /\bmy\s+tasks?\b/i.test(lower)
  ) {
    return handleListTasks(text, channel, userId, token, threadTs)
  }

  await postMessage(
    channel,
    `:thinking_face: I'm not sure what you mean. Try \`@claude help\` to see what I can do.`,
    token,
    threadTs
  )
}

// ── Cloud Function Entry Point ────────────────────────────────

exports.slack = onRequest(
  { secrets: [SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET] },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed')
    }

    // Verify Slack request signature
    const rawBody = req.rawBody
      ? req.rawBody.toString()
      : JSON.stringify(req.body)

    if (
      !verifySignature(
        rawBody,
        req.headers['x-slack-request-timestamp'],
        req.headers['x-slack-signature'],
        process.env.SLACK_SIGNING_SECRET
      )
    ) {
      return res.status(401).send('Invalid signature')
    }

    const body = req.body

    // URL verification challenge (Slack sends this once during setup)
    if (body.type === 'url_verification') {
      return res.json({ challenge: body.challenge })
    }

    // Skip Slack retries (we already processed the original)
    if (req.headers['x-slack-retry-num']) {
      return res.status(200).send('ok')
    }

    // Acknowledge immediately — Slack requires a response within 3 seconds
    res.status(200).send('')

    // Process the event asynchronously
    if (body.type === 'event_callback' && body.event) {
      const event = body.event

      // Only handle app_mention events; ignore bot messages
      if (event.type === 'app_mention' && !event.bot_id) {
        const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim()
        const channel = event.channel
        const userId = event.user
        const threadTs = event.thread_ts || event.ts

        try {
          await routeCommand(
            text,
            channel,
            userId,
            process.env.SLACK_BOT_TOKEN,
            threadTs
          )
        } catch (err) {
          console.error('Error handling Slack command:', err)
          await postMessage(
            channel,
            `:x: Something went wrong: ${err.message}`,
            process.env.SLACK_BOT_TOKEN,
            threadTs
          )
        }
      }
    }
  }
)
