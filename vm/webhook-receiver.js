const express = require('express')
const app = express()
app.use(express.json())

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ''
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || ''
const TELL_ASTY_CHANNEL = process.env.TELL_ASTY_CHANNEL || '#tell-asty'
const PORT = process.env.PORT || 3001

const MESSAGE_TEMPLATES = [
  (title, project) => `Just saw someone asked me to help with *${title}*${project}. I'm on it!`,
  (title, project) => `Oh nice — I've been tagged on *${title}*${project}. Already thinking about it!`,
  (title, project) => `Just picked up *${title}*${project}. I'll get started right away!`,
  (title, project) => `Got a new one: *${title}*${project}. On it!`,
  (title, project) => `Looks like I'm needed for *${title}*${project}. Consider it handled!`,
  (title, project) => `Just noticed I've been assigned *${title}*${project}. I'm on it!`,
]

function buildMessage(task) {
  const project = task.projectName ? ` for ${task.projectName}` : ''
  const template = MESSAGE_TEMPLATES[Math.floor(Math.random() * MESSAGE_TEMPLATES.length)]
  return template(task.title, project)
}

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

  if (SLACK_BOT_TOKEN) {
    await postToSlack(TELL_ASTY_CHANNEL, buildMessage(task))
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
