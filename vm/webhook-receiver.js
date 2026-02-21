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
