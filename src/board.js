import { STATUSES, TEAM, PRIORITIES } from './config.js'
import { createTask, updateTask } from './db.js'
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
      <input class="column-add-input" data-status="${s.id}" placeholder="+ Add task" type="text">
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

  // Inline add-task inputs
  container.querySelectorAll('.column-add-input').forEach((input) => {
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const title = input.value.trim()
        if (!title) return
        input.disabled = true
        await createTask(ctx.db, {
          title,
          status: input.dataset.status,
          clientId: ctx.filterClientId || '',
          projectId: ctx.filterProjectId || '',
          createdBy: ctx.currentUser?.email || '',
        })
        input.value = ''
        input.disabled = false
        input.focus()
      }
      if (e.key === 'Escape') {
        input.value = ''
        input.blur()
      }
    })
  })

  // === Drag and Drop ===
  container.querySelectorAll('.task-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.id)
      e.dataTransfer.effectAllowed = 'move'
      card.classList.add('dragging')
    })
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging')
      container.querySelectorAll('.column-tasks').forEach((col) => col.classList.remove('drag-over'))
    })
  })

  container.querySelectorAll('.column-tasks').forEach((col) => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      col.classList.add('drag-over')
    })
    col.addEventListener('dragleave', (e) => {
      if (!col.contains(e.relatedTarget)) {
        col.classList.remove('drag-over')
      }
    })
    col.addEventListener('drop', async (e) => {
      e.preventDefault()
      col.classList.remove('drag-over')
      const taskId = e.dataTransfer.getData('text/plain')
      const newStatus = col.dataset.status
      const task = tasks.find((t) => t.id === taskId)
      if (task && task.status !== newStatus) {
        await updateTask(ctx.db, taskId, { status: newStatus })
      }
    })
  })
}

export function renderBoardByAssignee(container, tasks, ctx) {
  // Build columns: Unassigned + one per team member
  const columns = [
    { email: '', name: 'Unassigned', color: '#6b7280', photoURL: null },
    ...TEAM,
  ]

  container.innerHTML = `<div class="board">${columns.map(
    (col) => {
      const colTasks = tasks.filter((t) => (t.assignee || '') === col.email)
      const avatarHtml = col.photoURL
        ? `<img class="avatar-photo-xs" src="${col.photoURL}" alt="${col.name}">`
        : `<span class="column-dot" style="background:${col.color}"></span>`
      return `
      <div class="column" data-assignee="${col.email}">
        <div class="column-header">
          ${avatarHtml}
          <span class="column-label">${col.name}</span>
          <span class="column-count">${colTasks.length}</span>
        </div>
        <div class="column-tasks" data-assignee="${col.email}">
          ${colTasks.map((t) => taskCardByAssignee(t, ctx)).join('')}
        </div>
        <input class="column-add-input" data-assignee="${col.email}" placeholder="+ Add task" type="text">
      </div>
    `
    }
  ).join('')}</div>`

  // Click handlers
  container.querySelectorAll('.task-card').forEach((card) => {
    card.addEventListener('click', () => {
      const task = tasks.find((t) => t.id === card.dataset.id)
      if (task) openModal(task, ctx)
    })
  })

  // Inline add-task inputs
  container.querySelectorAll('.column-add-input').forEach((input) => {
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const title = input.value.trim()
        if (!title) return
        input.disabled = true
        await createTask(ctx.db, {
          title,
          assignee: input.dataset.assignee,
          clientId: ctx.filterClientId || '',
          projectId: ctx.filterProjectId || '',
          createdBy: ctx.currentUser?.email || '',
        })
        input.value = ''
        input.disabled = false
        input.focus()
      }
      if (e.key === 'Escape') {
        input.value = ''
        input.blur()
      }
    })
  })

  // Drag and drop — reassign on drop
  container.querySelectorAll('.task-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.id)
      e.dataTransfer.effectAllowed = 'move'
      card.classList.add('dragging')
    })
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging')
      container.querySelectorAll('.column-tasks').forEach((col) => col.classList.remove('drag-over'))
    })
  })

  container.querySelectorAll('.column-tasks').forEach((col) => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      col.classList.add('drag-over')
    })
    col.addEventListener('dragleave', (e) => {
      if (!col.contains(e.relatedTarget)) {
        col.classList.remove('drag-over')
      }
    })
    col.addEventListener('drop', async (e) => {
      e.preventDefault()
      col.classList.remove('drag-over')
      const taskId = e.dataTransfer.getData('text/plain')
      const newAssignee = col.dataset.assignee
      const task = tasks.find((t) => t.id === taskId)
      if (task && (task.assignee || '') !== newAssignee) {
        await updateTask(ctx.db, taskId, { assignee: newAssignee })
      }
    })
  })
}

function taskCardByAssignee(task, ctx) {
  const priority = PRIORITIES.find((p) => p.id === task.priority)
  const project = ctx.projects.find((p) => p.id === task.projectId)
  const client = ctx.clients.find((c) => c.id === task.clientId)
  const status = STATUSES.find((s) => s.id === task.status)
  const deadlineStr = formatDeadline(task.deadline)
  const isOverdue = task.deadline && task.status !== 'done' && toDate(task.deadline) < new Date()

  const clientLogo = client?.logoUrl
    ? `<img class="client-logo-xs" src="${client.logoUrl}" alt="${esc(client.name)}" title="${esc(client.name)}">`
    : ''

  return `
    <div class="task-card" data-id="${task.id}" draggable="true">
      <div class="task-card-header">
        <span class="priority-dot" style="background:${priority?.color || '#6b7280'}"></span>
        <span class="task-card-title">${esc(task.title)}</span>
      </div>
      <div class="task-card-meta">
        <div class="task-card-tags">
          ${clientLogo}
          ${client ? `<span class="task-tag">${esc(client.name)}</span>` : ''}
          ${project ? `<span class="task-tag">${esc(project.name)}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          ${deadlineStr ? `<span class="task-card-deadline${isOverdue ? ' overdue' : ''}">${deadlineStr}</span>` : ''}
          ${status ? `<span class="task-tag" style="color:${status.color}">${status.label}</span>` : ''}
        </div>
      </div>
    </div>
  `
}

function taskCard(task, ctx) {
  const member = TEAM.find((m) => m.email === task.assignee)
  const priority = PRIORITIES.find((p) => p.id === task.priority)
  const project = ctx.projects.find((p) => p.id === task.projectId)
  const client = ctx.clients.find((c) => c.id === task.clientId)
  const deadlineStr = formatDeadline(task.deadline)
  const isOverdue = task.deadline && task.status !== 'done' && toDate(task.deadline) < new Date()

  const clientLogo = client?.logoUrl
    ? `<img class="client-logo-xs" src="${client.logoUrl}" alt="${esc(client.name)}" title="${esc(client.name)}">`
    : ''

  const avatarHtml = member
    ? (member.photoURL
      ? `<img class="avatar-photo-xs" src="${member.photoURL}" alt="${member.name}" title="${member.name}">`
      : `<span class="avatar-xs" style="background:${member.color}" title="${member.name}">${member.name[0]}</span>`)
    : ''

  return `
    <div class="task-card" data-id="${task.id}" draggable="true">
      <div class="task-card-header">
        <span class="priority-dot" style="background:${priority?.color || '#6b7280'}"></span>
        <span class="task-card-title">${esc(task.title)}</span>
      </div>
      <div class="task-card-meta">
        <div class="task-card-tags">
          ${clientLogo}
          ${client ? `<span class="task-tag">${esc(client.name)}</span>` : ''}
          ${project ? `<span class="task-tag">${esc(project.name)}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          ${deadlineStr ? `<span class="task-card-deadline${isOverdue ? ' overdue' : ''}">${deadlineStr}</span>` : ''}
          ${avatarHtml}
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
