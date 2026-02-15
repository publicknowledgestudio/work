import { TEAM, STATUSES, PRIORITIES } from './config.js'
import { openModal } from './modal.js'

export function renderStandup(container, tasks, ctx) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  // Build per-member data
  const members = TEAM.map((m) => {
    const memberTasks = tasks.filter((t) => t.assignee === m.email)

    // Closed yesterday: status=done AND closedAt is between yesterdayStart and todayStart
    const closedYesterday = memberTasks.filter((t) => {
      if (t.status !== 'done' || !t.closedAt) return false
      const closed = toDate(t.closedAt)
      return closed >= yesterdayStart && closed < todayStart
    })

    // Open today: anything not done
    const openToday = memberTasks.filter((t) => t.status !== 'done')

    return { ...m, closedYesterday, openToday }
  })

  // Unassigned open tasks
  const unassignedOpen = tasks.filter((t) => !t.assignee && t.status !== 'done')

  container.innerHTML = `
    <div class="standup-view">
      <div class="standup-header">
        <h2>Daily Standup</h2>
        <p>${formatDate(now)}</p>
      </div>
      <div class="standup-members">
        ${members.map((m) => memberSection(m, ctx)).join('')}
        ${unassignedOpen.length ? unassignedSection(unassignedOpen, ctx) : ''}
      </div>
    </div>
  `

  // Click handlers for task cards
  container.querySelectorAll('.standup-task').forEach((el) => {
    el.addEventListener('click', () => {
      const task = tasks.find((t) => t.id === el.dataset.id)
      if (task) openModal(task, ctx)
    })
  })
}

function memberSection(member, ctx) {
  const avatarHtml = member.photoURL
    ? `<img class="avatar-photo-sm" src="${member.photoURL}" alt="${member.name}">`
    : `<span class="avatar-sm" style="background:${member.color}">${member.name[0]}</span>`

  return `
    <div class="standup-member">
      <div class="standup-member-header">
        ${avatarHtml}
        <span class="standup-member-name">${member.name}</span>
      </div>
      ${member.closedYesterday.length ? `
        <div class="standup-section">
          <div class="standup-section-label"><i class="ph-fill ph-check-circle" style="color:#22c55e"></i> Completed yesterday</div>
          ${member.closedYesterday.map((t) => standupTask(t, ctx, true)).join('')}
        </div>
      ` : ''}
      ${member.openToday.length ? `
        <div class="standup-section">
          <div class="standup-section-label"><i class="ph-fill ph-circle-dashed" style="color:#f59e0b"></i> Working on today</div>
          ${member.openToday.map((t) => standupTask(t, ctx, false)).join('')}
        </div>
      ` : ''}
      ${!member.closedYesterday.length && !member.openToday.length ? `
        <div class="standup-empty">No tasks assigned</div>
      ` : ''}
    </div>
  `
}

function unassignedSection(tasks, ctx) {
  return `
    <div class="standup-member">
      <div class="standup-member-header">
        <span class="avatar-sm" style="background:#6b7280">?</span>
        <span class="standup-member-name">Unassigned</span>
      </div>
      <div class="standup-section">
        <div class="standup-section-label">Open tasks</div>
        ${tasks.map((t) => standupTask(t, ctx, false)).join('')}
      </div>
    </div>
  `
}

function standupTask(task, ctx, isDone) {
  const priority = PRIORITIES.find((p) => p.id === task.priority)
  const status = STATUSES.find((s) => s.id === task.status)
  const client = ctx.clients.find((c) => c.id === task.clientId)
  const project = ctx.projects.find((p) => p.id === task.projectId)

  const clientLogo = client?.logoUrl
    ? `<img class="client-logo-xs" src="${client.logoUrl}" alt="${esc(client.name)}" title="${esc(client.name)}">`
    : ''

  return `
    <div class="standup-task${isDone ? ' done' : ''}" data-id="${task.id}">
      <div class="standup-task-left">
        <span class="priority-dot" style="background:${priority?.color || '#6b7280'}"></span>
        <span class="standup-task-title${isDone ? ' line-through' : ''}">${esc(task.title)}</span>
      </div>
      <div class="standup-task-right">
        ${clientLogo}
        ${client ? `<span class="task-tag">${esc(client.name)}</span>` : ''}
        ${project ? `<span class="task-tag">${esc(project.name)}</span>` : ''}
        <span class="task-tag" style="color:${status?.color || '#6b7280'}">${status?.label || task.status}</span>
      </div>
    </div>
  `
}

function formatDate(d) {
  return d.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
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
