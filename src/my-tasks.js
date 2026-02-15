import { STATUSES, TEAM, PRIORITIES } from './config.js'
import { openModal } from './modal.js'

export function renderMyTasks(container, tasks, currentUser, ctx) {
  const myEmail = currentUser?.email
  const myTasks = tasks.filter((t) => t.assignee === myEmail && t.status !== 'done')
  const doneTasks = tasks.filter((t) => t.assignee === myEmail && t.status === 'done').slice(0, 10)

  if (myTasks.length === 0 && doneTasks.length === 0) {
    container.innerHTML = `
      <div class="my-tasks">
        <div class="empty-state">
          <div class="empty-state-icon">&#9745;</div>
          <div class="empty-state-text">No tasks assigned to you yet</div>
        </div>
      </div>`
    return
  }

  // Group active tasks by status
  const grouped = {}
  STATUSES.filter((s) => s.id !== 'done').forEach((s) => {
    const items = myTasks.filter((t) => t.status === s.id)
    if (items.length > 0) grouped[s.id] = items
  })

  container.innerHTML = `
    <div class="my-tasks">
      ${Object.entries(grouped)
        .map(
          ([statusId, items]) => `
        <div class="my-tasks-section">
          <div class="my-tasks-section-title">
            <span class="column-dot" style="background:${STATUSES.find((s) => s.id === statusId)?.color}"></span>
            ${STATUSES.find((s) => s.id === statusId)?.label} (${items.length})
          </div>
          ${items.map((t) => taskRow(t, ctx)).join('')}
        </div>
      `
        )
        .join('')}
      ${
        doneTasks.length > 0
          ? `
        <div class="my-tasks-section">
          <div class="my-tasks-section-title">
            <span class="column-dot" style="background:#22c55e"></span>
            Recently Done (${doneTasks.length})
          </div>
          ${doneTasks.map((t) => taskRow(t, ctx)).join('')}
        </div>
      `
          : ''
      }
    </div>`

  // Click handlers
  container.querySelectorAll('.my-task-row').forEach((row) => {
    row.addEventListener('click', () => {
      const task = tasks.find((t) => t.id === row.dataset.id)
      if (task) openModal(task, ctx)
    })
  })
}

function taskRow(task, ctx) {
  const priority = PRIORITIES.find((p) => p.id === task.priority)
  const project = ctx.projects.find((p) => p.id === task.projectId)
  const deadlineStr = formatDeadline(task.deadline)
  const isOverdue = task.deadline && task.status !== 'done' && toDate(task.deadline) < new Date()

  return `
    <div class="my-task-row" data-id="${task.id}">
      <span class="priority-dot" style="background:${priority?.color || '#6b7280'}"></span>
      <span class="my-task-title">${esc(task.title)}</span>
      ${project ? `<span class="my-task-project">${esc(project.name)}</span>` : ''}
      ${deadlineStr ? `<span class="my-task-deadline${isOverdue ? ' overdue' : ''}">${deadlineStr}</span>` : ''}
    </div>`
}

function formatDeadline(deadline) {
  if (!deadline) return ''
  const d = toDate(deadline)
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
