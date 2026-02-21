import { TEAM, STATUSES } from './config.js'
import { openModal } from './modal.js'
import { updateTask } from './db.js'

// Session-only state: which tasks have been "discussed" this standup
const discussedIds = new Set()

export function renderStandup(container, tasks, ctx) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  // ── Section 1: Review & Discuss ──
  // Tasks marked done in the last ~48h (yesterday + today) that the team should review
  const recentlyDone = tasks.filter((t) => {
    if (t.status !== 'done' || !t.closedAt) return false
    const closed = toDate(t.closedAt)
    return closed >= yesterdayStart
  })

  // ── Section 2: In Progress ──
  // All non-done tasks, grouped by team member
  const inProgressByMember = TEAM.map((m) => {
    const memberTasks = tasks
      .filter((t) => (t.assignees || []).includes(m.email) && t.status !== 'done')
      .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority))
    return { ...m, tasks: memberTasks }
  }).filter((m) => m.tasks.length > 0)

  // ── Section 3: Needs Attention ──
  const overdue = tasks.filter((t) => {
    if (t.status === 'done' || !t.deadline) return false
    return toDate(t.deadline) < todayStart
  })
  const stuckInReview = tasks.filter((t) => t.status === 'review')
  const unassigned = tasks.filter((t) => (!t.assignees || t.assignees.length === 0) && t.status !== 'done')

  // Combine unique attention items
  const attentionIds = new Set()
  const attentionItems = []
  ;[...overdue, ...stuckInReview, ...unassigned].forEach((t) => {
    if (!attentionIds.has(t.id)) {
      attentionIds.add(t.id)
      const reasons = []
      if (t.deadline && toDate(t.deadline) < todayStart && t.status !== 'done') reasons.push('overdue')
      if (t.status === 'review') reasons.push('in review')
      if (!t.assignees || t.assignees.length === 0) reasons.push('unassigned')
      attentionItems.push({ ...t, reasons })
    }
  })

  // Progress tracking
  const totalAgendaItems = recentlyDone.length + attentionItems.length
  const discussedCount = recentlyDone.filter((t) => discussedIds.has(t.id)).length
    + attentionItems.filter((t) => discussedIds.has(t.id)).length
  const progressPct = totalAgendaItems > 0 ? Math.round((discussedCount / totalAgendaItems) * 100) : 100

  container.innerHTML = `
    <div class="standup-view">
      <div class="standup-header">
        <div class="standup-header-top">
          <div>
            <h2>Daily Scrum</h2>
            <p>${formatDate(now)}</p>
          </div>
          ${totalAgendaItems > 0 ? `
            <div class="standup-progress">
              <span class="standup-progress-label">${discussedCount} / ${totalAgendaItems} discussed</span>
              <div class="standup-progress-bar">
                <div class="standup-progress-fill" style="width:${progressPct}%"></div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Section 1: Review & Discuss -->
      <div class="standup-agenda-section">
        <div class="standup-agenda-header">
          <i class="ph-fill ph-chat-circle-dots" style="color:#22c55e"></i>
          <span>Review &amp; Discuss</span>
          <span class="standup-agenda-count">${recentlyDone.length}</span>
        </div>
        ${recentlyDone.length ? `
          <div class="standup-agenda-desc">Recently completed — review, give feedback, or reopen</div>
          <div class="standup-items">
            ${recentlyDone.map((t) => reviewCard(t, ctx, now)).join('')}
          </div>
        ` : `
          <div class="standup-empty-section">No tasks completed recently</div>
        `}
      </div>

      <!-- Section 2: In Progress -->
      <div class="standup-agenda-section">
        <div class="standup-agenda-header">
          <i class="ph-fill ph-circle-dashed" style="color:#f59e0b"></i>
          <span>In Progress</span>
          <span class="standup-agenda-count">${inProgressByMember.reduce((s, m) => s + m.tasks.length, 0)}</span>
        </div>
        ${inProgressByMember.length ? `
          <div class="standup-agenda-desc">What everyone is working on today</div>
          <div class="standup-items">
            ${inProgressByMember.map((m) => memberGroup(m, ctx, now)).join('')}
          </div>
        ` : `
          <div class="standup-empty-section">No active tasks</div>
        `}
      </div>

      <!-- Section 3: Needs Attention -->
      <div class="standup-agenda-section">
        <div class="standup-agenda-header">
          <i class="ph-fill ph-warning-circle" style="color:#ef4444"></i>
          <span>Needs Attention</span>
          <span class="standup-agenda-count">${attentionItems.length}</span>
        </div>
        ${attentionItems.length ? `
          <div class="standup-agenda-desc">Overdue, stuck, or unassigned — discuss and resolve</div>
          <div class="standup-items">
            ${attentionItems.map((t) => attentionCard(t, ctx, now)).join('')}
          </div>
        ` : `
          <div class="standup-empty-section">Nothing flagged — all clear!</div>
        `}
      </div>
    </div>
  `

  bindActions(container, tasks, ctx)
}

// ── Card renderers ──

function reviewCard(task, ctx, now) {
  const assignees = assigneeAvatars(task, ctx)
  const project = ctx.projects.find((p) => p.id === task.projectId)
  const client = ctx.clients.find((c) => c.id === task.clientId)
  const clientLogo = client?.logoUrl
    ? `<img class="client-logo-xs" src="${client.logoUrl}" alt="${esc(client.name)}">`
    : ''
  const isDone = discussedIds.has(task.id)
  const closedDate = toDate(task.closedAt)
  const timeAgo = closedDate ? relativeTime(closedDate, now) : ''

  return `
    <div class="scrum-card${isDone ? ' discussed' : ''}" data-id="${task.id}">
      <div class="scrum-card-main">
        <div class="scrum-card-top">
          <span class="scrum-card-title">${esc(task.title)}</span>
          <div class="scrum-card-meta">
            ${clientLogo}
            ${project ? `<span class="task-tag">${esc(project.name)}</span>` : ''}
            ${assignees}
          </div>
        </div>
        ${timeAgo ? `<span class="scrum-card-time">Completed ${timeAgo}</span>` : ''}
      </div>
      <div class="scrum-card-actions">
        <button class="scrum-action-btn ${isDone ? 'active' : ''}" data-action="discuss" data-id="${task.id}" title="Mark as discussed">
          <i class="ph${isDone ? '-fill' : ''} ph-check-circle"></i> Discussed
        </button>
        <button class="scrum-action-btn" data-action="reopen" data-id="${task.id}" title="Reopen task">
          <i class="ph ph-arrow-counter-clockwise"></i> Reopen
        </button>
        <button class="scrum-action-btn" data-action="note" data-id="${task.id}" title="Add a note">
          <i class="ph ph-note-pencil"></i> Note
        </button>
      </div>
    </div>
  `
}

function memberGroup(member, ctx, now) {
  const avatarHtml = member.photoURL
    ? `<img class="avatar-photo-sm" src="${member.photoURL}" alt="${member.name}">`
    : `<span class="avatar-sm" style="background:${member.color}">${member.name[0]}</span>`

  return `
    <div class="scrum-member-group">
      <div class="scrum-member-label">
        ${avatarHtml}
        <span>${member.name}</span>
        <span class="standup-agenda-count">${member.tasks.length}</span>
      </div>
      ${member.tasks.map((t) => progressCard(t, ctx, now)).join('')}
    </div>
  `
}

function progressCard(task, ctx, now) {
  const status = STATUSES.find((s) => s.id === task.status)
  const project = ctx.projects.find((p) => p.id === task.projectId)
  const client = ctx.clients.find((c) => c.id === task.clientId)
  const clientLogo = client?.logoUrl
    ? `<img class="client-logo-xs" src="${client.logoUrl}" alt="${esc(client.name)}">`
    : ''
  const deadlineHtml = deadlineTag(task, now)
  const nextStatus = getNextStatus(task.status)

  return `
    <div class="scrum-card" data-id="${task.id}">
      <div class="scrum-card-main">
        <div class="scrum-card-top">
          ${task.priority === 'urgent' ? '<i class="ph-fill ph-warning urgent-icon"></i>' : ''}
          ${task.priority === 'high' ? '<i class="ph-fill ph-arrow-fat-up" style="color:#f59e0b;font-size:13px"></i>' : ''}
          <span class="scrum-card-title">${esc(task.title)}</span>
          <div class="scrum-card-meta">
            ${clientLogo}
            ${project ? `<span class="task-tag">${esc(project.name)}</span>` : ''}
            <span class="task-tag" style="color:${status?.color || '#6b7280'}">${status?.label || task.status}</span>
            ${deadlineHtml}
          </div>
        </div>
      </div>
      <div class="scrum-card-actions">
        ${nextStatus ? `
          <button class="scrum-action-btn" data-action="advance" data-id="${task.id}" data-next="${nextStatus.id}" title="Move to ${nextStatus.label}">
            <i class="ph ph-arrow-right"></i> ${nextStatus.label}
          </button>
        ` : ''}
        <button class="scrum-action-btn" data-action="note" data-id="${task.id}" title="Add a note">
          <i class="ph ph-note-pencil"></i> Note
        </button>
      </div>
    </div>
  `
}

function attentionCard(task, ctx, now) {
  const status = STATUSES.find((s) => s.id === task.status)
  const project = ctx.projects.find((p) => p.id === task.projectId)
  const client = ctx.clients.find((c) => c.id === task.clientId)
  const clientLogo = client?.logoUrl
    ? `<img class="client-logo-xs" src="${client.logoUrl}" alt="${esc(client.name)}">`
    : ''
  const assignees = assigneeAvatars(task, ctx)
  const deadlineHtml = deadlineTag(task, now)
  const isDone = discussedIds.has(task.id)
  const nextStatus = getNextStatus(task.status)

  const reasonTags = task.reasons.map((r) => {
    const colors = { overdue: '#ef4444', 'in review': '#8b5cf6', unassigned: '#6b7280' }
    return `<span class="scrum-reason-tag" style="color:${colors[r] || '#6b7280'}"><i class="ph-fill ${reasonIcon(r)}"></i> ${r}</span>`
  }).join('')

  return `
    <div class="scrum-card attention${isDone ? ' discussed' : ''}" data-id="${task.id}">
      <div class="scrum-card-main">
        <div class="scrum-card-top">
          <span class="scrum-card-title">${esc(task.title)}</span>
          <div class="scrum-card-meta">
            ${clientLogo}
            ${project ? `<span class="task-tag">${esc(project.name)}</span>` : ''}
            <span class="task-tag" style="color:${status?.color || '#6b7280'}">${status?.label || task.status}</span>
            ${deadlineHtml}
            ${assignees}
          </div>
        </div>
        <div class="scrum-reasons">${reasonTags}</div>
      </div>
      <div class="scrum-card-actions">
        <button class="scrum-action-btn ${isDone ? 'active' : ''}" data-action="discuss" data-id="${task.id}" title="Mark as discussed">
          <i class="ph${isDone ? '-fill' : ''} ph-check-circle"></i> Discussed
        </button>
        ${nextStatus ? `
          <button class="scrum-action-btn" data-action="advance" data-id="${task.id}" data-next="${nextStatus.id}" title="Move to ${nextStatus.label}">
            <i class="ph ph-arrow-right"></i> ${nextStatus.label}
          </button>
        ` : ''}
        <button class="scrum-action-btn" data-action="note" data-id="${task.id}" title="Add a note">
          <i class="ph ph-note-pencil"></i> Note
        </button>
      </div>
    </div>
  `
}

// ── Actions ──

function bindActions(container, tasks, ctx) {
  // Open modal on card click (but not on action buttons)
  container.querySelectorAll('.scrum-card-main').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.closest('.scrum-card').dataset.id
      const task = tasks.find((t) => t.id === id)
      if (task) openModal(task, ctx)
    })
  })

  // Discuss toggle
  container.querySelectorAll('[data-action="discuss"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const id = btn.dataset.id
      if (discussedIds.has(id)) {
        discussedIds.delete(id)
      } else {
        discussedIds.add(id)
      }
      renderStandup(container, tasks, ctx)
    })
  })

  // Reopen (move from done → todo)
  container.querySelectorAll('[data-action="reopen"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const id = btn.dataset.id
      btn.disabled = true
      await updateTask(ctx.db, id, { status: 'todo' })
      discussedIds.delete(id)
      // Real-time listener will re-render
    })
  })

  // Advance status
  container.querySelectorAll('[data-action="advance"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const id = btn.dataset.id
      const next = btn.dataset.next
      btn.disabled = true
      await updateTask(ctx.db, id, { status: next })
      // Real-time listener will re-render
    })
  })

  // Quick note — inline input
  container.querySelectorAll('[data-action="note"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const card = btn.closest('.scrum-card')
      const id = card.dataset.id

      // Don't add twice
      if (card.querySelector('.scrum-note-input')) return

      const inputRow = document.createElement('div')
      inputRow.className = 'scrum-note-row'
      inputRow.innerHTML = `
        <input type="text" class="scrum-note-input" placeholder="Add a quick note..." autofocus>
        <button class="scrum-note-save" title="Save note"><i class="ph ph-paper-plane-tilt"></i></button>
      `
      card.appendChild(inputRow)

      const input = inputRow.querySelector('.scrum-note-input')
      const saveBtn = inputRow.querySelector('.scrum-note-save')
      input.focus()

      const save = async () => {
        const text = input.value.trim()
        if (!text) { inputRow.remove(); return }

        const task = tasks.find((t) => t.id === id)
        if (!task) return

        const notes = [...(task.notes || []), {
          text,
          by: ctx.currentUser?.displayName || ctx.currentUser?.email || '',
          at: new Date().toISOString(),
        }]
        saveBtn.disabled = true
        await updateTask(ctx.db, id, { notes })
        inputRow.remove()
      }

      saveBtn.addEventListener('click', (e) => { e.stopPropagation(); save() })
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save()
        if (e.key === 'Escape') inputRow.remove()
      })
      input.addEventListener('click', (e) => e.stopPropagation())
    })
  })
}

// ── Helpers ──

function assigneeAvatars(task, ctx) {
  if (!task.assignees || task.assignees.length === 0) return ''
  return task.assignees.map((email) => {
    const m = TEAM.find((t) => t.email === email)
    if (!m) return ''
    if (m.photoURL) {
      return `<img class="avatar-photo-xs" src="${m.photoURL}" alt="${m.name}" title="${m.name}">`
    }
    return `<span class="avatar-xs" style="background:${m.color}" title="${m.name}">${m.name[0]}</span>`
  }).join('')
}

function deadlineTag(task, now) {
  if (!task.deadline) return ''
  const d = toDate(task.deadline)
  if (!d) return ''
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24))
  let cls = ''
  let label = ''
  if (diff < 0) {
    cls = 'overdue'
    label = `${Math.abs(diff)}d overdue`
  } else if (diff === 0) {
    cls = 'due-today'
    label = 'Due today'
  } else if (diff <= 2) {
    cls = 'due-soon'
    label = `Due in ${diff}d`
  } else {
    label = formatShortDate(d)
  }
  return `<span class="scrum-deadline ${cls}">${label}</span>`
}

function getNextStatus(currentStatus) {
  const order = ['backlog', 'todo', 'in_progress', 'review', 'done']
  const idx = order.indexOf(currentStatus)
  if (idx < 0 || idx >= order.length - 1) return null
  const nextId = order[idx + 1]
  return STATUSES.find((s) => s.id === nextId) || null
}

function priorityWeight(p) {
  const w = { urgent: 4, high: 3, medium: 2, low: 1 }
  return w[p] || 0
}

function reasonIcon(reason) {
  const icons = { overdue: 'ph-clock-countdown', 'in review': 'ph-hourglass-medium', unassigned: 'ph-user-minus' }
  return icons[reason] || 'ph-warning'
}

function relativeTime(date, now) {
  const diffMs = now - date
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDate(d) {
  return d.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatShortDate(d) {
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
