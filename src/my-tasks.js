import { STATUSES } from './config.js'
import { updateTask } from './db.js'
import { openModal } from './modal.js'

function sortUrgentFirst(tasks) {
  return [...tasks].sort((a, b) => (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1))
}

export function renderMyTasks(container, tasks, currentUser, ctx) {
  const myEmail = currentUser?.email
  const myTasks = tasks.filter((t) => (t.assignees || []).includes(myEmail))

  container.innerHTML = `
    <div class="my-tasks">
      ${STATUSES.map((s) => {
        const items = sortUrgentFirst(myTasks.filter((t) => t.status === s.id))
        return `
          <div class="my-tasks-section" data-status="${s.id}">
            <div class="my-tasks-section-title">
              <span class="column-dot" style="background:${s.color}"></span>
              ${s.label}
              <span class="my-tasks-count">${items.length}</span>
            </div>
            <div class="my-tasks-list" data-status="${s.id}">
              ${items.length ? items.map((t) => taskRow(t, ctx)).join('') : `
                <div class="my-tasks-empty">
                  <i class="ph ph-dots-three" style="opacity:0.4"></i>
                </div>
              `}
            </div>
          </div>
        `
      }).join('')}
    </div>`

  // Click handlers
  container.querySelectorAll('.my-task-row').forEach((row) => {
    row.addEventListener('click', () => {
      const task = myTasks.find((t) => t.id === row.dataset.id)
      if (task) openModal(task, ctx)
    })
  })

  // Drag and drop
  container.querySelectorAll('.my-task-row').forEach((row) => {
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', row.dataset.id)
      e.dataTransfer.effectAllowed = 'move'
      row.classList.add('dragging')
    })
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging')
      container.querySelectorAll('.my-tasks-list').forEach((list) => list.classList.remove('drag-over'))
    })
  })

  container.querySelectorAll('.my-tasks-list').forEach((list) => {
    list.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      list.classList.add('drag-over')
    })
    list.addEventListener('dragleave', (e) => {
      if (!list.contains(e.relatedTarget)) {
        list.classList.remove('drag-over')
      }
    })
    list.addEventListener('drop', async (e) => {
      e.preventDefault()
      list.classList.remove('drag-over')
      const taskId = e.dataTransfer.getData('text/plain')
      const newStatus = list.dataset.status
      const task = myTasks.find((t) => t.id === taskId)
      if (task && task.status !== newStatus) {
        await updateTask(ctx.db, taskId, { status: newStatus })
      }
    })
  })
}

function taskRow(task, ctx) {
  const client = ctx.clients.find((c) => c.id === task.clientId)
  const project = ctx.projects.find((p) => p.id === task.projectId)
  const deadlineStr = formatDeadline(task.deadline)
  const isOverdue = task.deadline && task.status !== 'done' && toDate(task.deadline) < new Date()
  const isDone = task.status === 'done'

  const clientLogo = client?.logoUrl
    ? `<img class="client-logo-xs" src="${client.logoUrl}" alt="${esc(client.name)}" title="${esc(client.name)}">`
    : ''

  return `
    <div class="my-task-row${isDone ? ' done' : ''}" data-id="${task.id}" draggable="true">
      ${statusIcon(task.status)}
      ${task.priority === 'urgent' ? '<i class="ph-fill ph-warning urgent-icon"></i>' : ''}
      <span class="my-task-title">${esc(task.title)}</span>
      <div class="my-task-meta">
        ${clientLogo}
        ${project ? `<span class="my-task-project">${esc(project.name)}</span>` : ''}
        ${deadlineStr ? `<span class="my-task-deadline${isOverdue ? ' overdue' : ''}">${deadlineStr}</span>` : ''}
      </div>
    </div>`
}

function statusIcon(status) {
  switch (status) {
    case 'done':
      return '<i class="ph-fill ph-check-circle status-icon done"></i>'
    case 'todo':
      return '<i class="ph ph-circle status-icon todo"></i>'
    case 'in_progress':
      return '<i class="ph-fill ph-circle-half status-icon in-progress"></i>'
    case 'review':
      return '<i class="ph-fill ph-eye status-icon review"></i>'
    default: // backlog
      return '<i class="ph ph-circle-dashed status-icon backlog"></i>'
  }
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
