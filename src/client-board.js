import { STATUSES, TEAM } from './config.js'
import { createTask, updateTask } from './db.js'
import { openModal } from './modal.js'
import { attachMention } from './mention.js'

export function renderClientBoard(container, tasks, ctx) {
  const clientId = ctx.userClientId
  const clientTasks = tasks.filter((t) => t.clientId === clientId)

  // Project filter for client's projects only
  const clientProjects = ctx.projects.filter((p) => p.clientId === clientId)
  let selectedProjectId = ''

  function render() {
    const filtered = selectedProjectId
      ? clientTasks.filter((t) => t.projectId === selectedProjectId)
      : clientTasks

    container.innerHTML = `
      <div class="client-board-view">
        <div class="client-board-header">
          <h2>Public Knowledge for ${esc(ctx.userClientName)}</h2>
          ${clientProjects.length > 1 ? `
            <select class="form-select client-project-filter" id="client-project-filter">
              <option value="">All Projects</option>
              ${clientProjects.map((p) => `<option value="${p.id}"${p.id === selectedProjectId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select>
          ` : ''}
        </div>
        <div class="board">
          ${STATUSES.map((s) => `
            <div class="column" data-status="${s.id}">
              <div class="column-header">
                <span class="column-dot" style="background:${s.color}"></span>
                <span class="column-label">${s.label}</span>
                <span class="column-count">${filtered.filter((t) => t.status === s.id).length}</span>
              </div>
              <div class="column-tasks" data-status="${s.id}">
                ${filtered.filter((t) => t.status === s.id)
                  .map((t) => taskCard(t, ctx))
                  .join('')}
              </div>
              <div class="column-add-wrap" data-status="${s.id}">
                <input class="column-add-input" data-status="${s.id}" placeholder="+ Add task (@ to tag)" type="text">
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `

    // Project filter
    const filterEl = container.querySelector('#client-project-filter')
    if (filterEl) {
      filterEl.addEventListener('change', () => {
        selectedProjectId = filterEl.value
        render()
      })
    }

    // Task card clicks
    container.querySelectorAll('.task-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.status-btn')) return
        const task = clientTasks.find((t) => t.id === card.dataset.id)
        if (task) openModal(task, ctx)
      })
    })

    // Inline add-task with mention support
    container.querySelectorAll('.column-add-input').forEach((input) => {
      const mention = attachMention(input, { projects: clientProjects, clients: ctx.clients })
      input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && !mention.isOpen()) {
          const title = input.value.trim()
          if (!title) return
          const mentionTags = mention.getTags()
          input.disabled = true
          await createTask(ctx.db, {
            title,
            status: input.dataset.status,
            assignees: mentionTags.assignees,
            clientId,
            projectId: mentionTags.projectId || selectedProjectId || '',
            createdBy: ctx.currentUser?.email || '',
          })
          input.value = ''
          input.disabled = false
          mention.reset()
          input.focus()
        }
        if (e.key === 'Escape' && !mention.isOpen()) {
          input.value = ''
          input.blur()
        }
      })
    })

    // Drag and drop
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
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'))
      col.addEventListener('drop', async (e) => {
        e.preventDefault()
        col.classList.remove('drag-over')
        const taskId = e.dataTransfer.getData('text/plain')
        const newStatus = col.dataset.status
        if (taskId && newStatus) {
          await updateTask(ctx.db, taskId, { status: newStatus })
        }
      })
    })
  }

  render()
}

function taskCard(task, ctx) {
  const project = task.projectId ? ctx.projects.find((p) => p.id === task.projectId) : null
  const assigneeAvatars = (task.assignees || []).map((email) => {
    const m = TEAM.find((t) => t.email === email)
    if (!m) return ''
    return m.photoURL
      ? `<img class="avatar-photo-xs" src="${m.photoURL}" alt="${m.name}" title="${m.name}">`
      : `<span class="avatar-xs" style="background:${m.color}" title="${m.name}">${m.name[0]}</span>`
  }).join('')

  const priorityBadge = task.priority === 'urgent' || task.priority === 'high'
    ? `<span class="priority-badge priority-${task.priority}">${task.priority}</span>`
    : ''

  const projectLabel = project ? `<span class="task-card-project">${esc(project.name)}</span>` : ''

  return `
    <div class="task-card" data-id="${task.id}" draggable="true">
      <div class="task-card-top">
        ${projectLabel}
        ${priorityBadge}
      </div>
      <div class="task-card-title">${esc(task.title)}</div>
      <div class="task-card-bottom">
        <div class="task-card-avatars">${assigneeAvatars}</div>
      </div>
    </div>
  `
}

function esc(str) {
  const el = document.createElement('span')
  el.textContent = str || ''
  return el.innerHTML
}
