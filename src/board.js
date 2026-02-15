import { STATUSES, TEAM } from './config.js'
import { createTask, updateTask } from './db.js'
import { openModal } from './modal.js'

function sortUrgentFirst(tasks) {
  return [...tasks].sort((a, b) => (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1))
}

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
        ${sortUrgentFirst(tasks.filter((t) => t.status === s.id))
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
      const colTasks = col.email
        ? tasks.filter((t) => (t.assignees || []).includes(col.email))
        : tasks.filter((t) => !t.assignees || t.assignees.length === 0)
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
          ${sortUrgentFirst(colTasks).map((t) => taskCardByAssignee(t, ctx)).join('')}
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
          assignees: input.dataset.assignee ? [input.dataset.assignee] : [],
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

  // Drag and drop — add assignee on drop
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
      if (!task) return

      if (newAssignee === '') {
        // Drop to Unassigned — clear all assignees
        await updateTask(ctx.db, taskId, { assignees: [] })
      } else {
        // Add this assignee if not already present
        const current = task.assignees || []
        if (!current.includes(newAssignee)) {
          await updateTask(ctx.db, taskId, { assignees: [...current, newAssignee] })
        }
      }
    })
  })
}

export function renderBoardByClient(container, tasks, ctx) {
  // Build columns: one per client + "No Client"
  const columns = [
    ...ctx.clients.map((c) => ({
      id: c.id,
      name: c.name,
      logoUrl: c.logoUrl || null,
    })),
    { id: '', name: 'No Client', logoUrl: null },
  ]

  container.innerHTML = `<div class="board">${columns.map(
    (col) => {
      const colTasks = tasks.filter((t) => (t.clientId || '') === col.id)
      const logoHtml = col.logoUrl
        ? `<img class="client-logo-xs" src="${col.logoUrl}" alt="${esc(col.name)}">`
        : `<span class="column-dot" style="background:#6b7280"></span>`
      return `
      <div class="column" data-client-id="${col.id}">
        <div class="column-header">
          ${logoHtml}
          <span class="column-label">${esc(col.name)}</span>
          <span class="column-count">${colTasks.length}</span>
        </div>
        <div class="column-tasks" data-client-id="${col.id}">
          ${sortUrgentFirst(colTasks).map((t) => taskCardByClient(t, ctx)).join('')}
        </div>
        <input class="column-add-input" data-client-id="${col.id}" placeholder="+ Add task" type="text">
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
          clientId: input.dataset.clientId,
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

  // Drag and drop — reassign client on drop
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
      const newClientId = col.dataset.clientId
      const task = tasks.find((t) => t.id === taskId)
      if (task && (task.clientId || '') !== newClientId) {
        await updateTask(ctx.db, taskId, { clientId: newClientId })
      }
    })
  })
}

function avatarStack(assignees) {
  if (!assignees || assignees.length === 0) return ''
  const members = assignees.map((email) => TEAM.find((m) => m.email === email)).filter(Boolean)
  if (members.length === 0) return ''
  return `<div class="avatar-stack">${members.map((m) =>
    m.photoURL
      ? `<img class="avatar-photo-xs" src="${m.photoURL}" alt="${m.name}" title="${m.name}">`
      : `<span class="avatar-xs" style="background:${m.color}" title="${m.name}">${m.name[0]}</span>`
  ).join('')}</div>`
}

function taskCardByClient(task, ctx) {
  const project = ctx.projects.find((p) => p.id === task.projectId)
  const status = STATUSES.find((s) => s.id === task.status)
  const deadlineStr = formatDeadline(task.deadline)
  const isOverdue = task.deadline && task.status !== 'done' && toDate(task.deadline) < new Date()
  const isDone = task.status === 'done'

  return `
    <div class="task-card${isDone ? ' done' : ''}" data-id="${task.id}" draggable="true">
      <div class="task-card-header">
        ${statusIcon(task.status)}
        ${task.priority === 'urgent' ? '<i class="ph-fill ph-warning urgent-icon"></i>' : ''}
        <span class="task-card-title">${esc(task.title)}</span>
      </div>
      <div class="task-card-meta">
        <div class="task-card-tags">
          ${project ? `<span class="task-tag">${esc(project.name)}</span>` : ''}
          ${status ? `<span class="task-tag" style="color:${status.color}">${status.label}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          ${deadlineStr ? `<span class="task-card-deadline${isOverdue ? ' overdue' : ''}">${deadlineStr}</span>` : ''}
          ${avatarStack(task.assignees)}
        </div>
      </div>
    </div>
  `
}

function taskCardByAssignee(task, ctx) {
  const project = ctx.projects.find((p) => p.id === task.projectId)
  const client = ctx.clients.find((c) => c.id === task.clientId)
  const status = STATUSES.find((s) => s.id === task.status)
  const deadlineStr = formatDeadline(task.deadline)
  const isOverdue = task.deadline && task.status !== 'done' && toDate(task.deadline) < new Date()
  const isDone = task.status === 'done'

  const clientLogo = client?.logoUrl
    ? `<img class="client-logo-xs" src="${client.logoUrl}" alt="${esc(client.name)}" title="${esc(client.name)}">`
    : ''

  return `
    <div class="task-card${isDone ? ' done' : ''}" data-id="${task.id}" draggable="true">
      <div class="task-card-header">
        ${statusIcon(task.status)}
        ${task.priority === 'urgent' ? '<i class="ph-fill ph-warning urgent-icon"></i>' : ''}
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
  const project = ctx.projects.find((p) => p.id === task.projectId)
  const client = ctx.clients.find((c) => c.id === task.clientId)
  const deadlineStr = formatDeadline(task.deadline)
  const isOverdue = task.deadline && task.status !== 'done' && toDate(task.deadline) < new Date()
  const isDone = task.status === 'done'

  const clientLogo = client?.logoUrl
    ? `<img class="client-logo-xs" src="${client.logoUrl}" alt="${esc(client.name)}" title="${esc(client.name)}">`
    : ''

  return `
    <div class="task-card${isDone ? ' done' : ''}" data-id="${task.id}" draggable="true">
      <div class="task-card-header">
        ${statusIcon(task.status)}
        ${task.priority === 'urgent' ? '<i class="ph-fill ph-warning urgent-icon"></i>' : ''}
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
          ${avatarStack(task.assignees)}
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

function esc(str) {
  const el = document.createElement('span')
  el.textContent = str || ''
  return el.innerHTML
}
