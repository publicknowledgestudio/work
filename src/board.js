import { STATUSES, TEAM, PRIORITIES } from './config.js'
import { openModal } from './modal.js'

export function renderBoard(container, tasks, ctx) {
  container.innerHTML = `<div class="board">${STATUSES.map(
    (s) => `
    <div class="column" data-status="${s.id}">
      <div class="column-header">
        <span class="column-dot" style="background:${s.color}"></span>
        <span class="column-label">${s.label}</span>
        <span class="column-count">${tasks.filter((t) => t.status === s.id).length}</span>
      </div>
      <div class="column-tasks" data-status="${s.id}">
        ${tasks
          .filter((t) => t.status === s.id)
          .map((t) => taskCard(t, ctx))
          .join('')}
      </div>
      <button class="column-add" data-status="${s.id}">+ Add task</button>
    </div>
  `
  ).join('')}</div>`

  // Click handlers for task cards
  container.querySelectorAll('.task-card').forEach((card) => {
    card.addEventListener('click', () => {
      const task = tasks.find((t) => t.id === card.dataset.id)
      if (task) openModal(task, ctx)
    })
  })

  // Click handlers for add buttons
  container.querySelectorAll('.column-add').forEach((btn) => {
    btn.addEventListener('click', () => {
      openModal(null, { ...ctx, defaultStatus: btn.dataset.status })
    })
  })
}

function taskCard(task, ctx) {
  const member = TEAM.find((m) => m.email === task.assignee)
  const priority = PRIORITIES.find((p) => p.id === task.priority)
  const project = ctx.projects.find((p) => p.id === task.projectId)
  const client = ctx.clients.find((c) => c.id === task.clientId)
  const deadlineStr = formatDeadline(task.deadline)
  const isOverdue = task.deadline && task.status !== 'done' && toDate(task.deadline) < new Date()

  return `
    <div class="task-card" data-id="${task.id}">
      <div class="task-card-header">
        <span class="priority-dot" style="background:${priority?.color || '#6b7280'}"></span>
        <span class="task-card-title">${esc(task.title)}</span>
      </div>
      <div class="task-card-meta">
        <div class="task-card-tags">
          ${client ? `<span class="task-tag">${esc(client.name)}</span>` : ''}
          ${project ? `<span class="task-tag">${esc(project.name)}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          ${deadlineStr ? `<span class="task-card-deadline${isOverdue ? ' overdue' : ''}">${deadlineStr}</span>` : ''}
          ${member ? `<span class="avatar-xs" style="background:${member.color}" title="${member.name}">${member.name[0]}</span>` : ''}
        </div>
      </div>
    </div>
  `
}

function formatDeadline(deadline) {
  if (!deadline) return ''
  const d = toDate(deadline)
  const now = new Date()
  const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24))

  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff < -1) return `${Math.abs(diff)}d ago`
  if (diff <= 7) return `${diff}d`

  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

function toDate(ts) {
  if (!ts) return null
  if (ts.toDate) return ts.toDate()
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

function esc(str) {
  const el = document.createElement('span')
  el.textContent = str || ''
  return el.innerHTML
}
