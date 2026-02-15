import { TEAM, PRIORITIES } from './config.js'
import { createTask, updateTask, deleteTask } from './db.js'

const overlay = document.getElementById('task-modal')
const closeBtn = document.getElementById('modal-close')
const cancelBtn = document.getElementById('task-cancel')
const saveBtn = document.getElementById('task-save')
const deleteBtn = document.getElementById('task-delete')
const titleEl = document.getElementById('modal-title')

let currentTask = null
let currentCtx = null
let selectedAssignees = []

// Close handlers
closeBtn.addEventListener('click', close)
cancelBtn.addEventListener('click', close)
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) close()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close()
})

// Save handler
saveBtn.addEventListener('click', async () => {
  const title = document.getElementById('task-title').value.trim()
  if (!title) {
    document.getElementById('task-title').focus()
    return
  }

  const data = {
    title,
    description: document.getElementById('task-description').value.trim(),
    clientId: document.getElementById('task-client').value,
    projectId: document.getElementById('task-project').value,
    assignees: [...selectedAssignees],
    status: document.getElementById('task-status').value,
    priority: document.getElementById('task-priority').value,
    deadline: document.getElementById('task-deadline').value || null,
  }

  // Handle new note
  const noteText = document.getElementById('task-notes').value.trim()
  if (noteText) {
    const userName =
      TEAM.find((m) => m.email === currentCtx.currentUser?.email)?.name ||
      currentCtx.currentUser?.displayName ||
      ''
    const newNote = {
      text: noteText,
      author: userName,
      timestamp: new Date().toISOString(),
    }
    if (currentTask) {
      data.notes = [...(currentTask.notes || []), newNote]
    } else {
      data.notes = [newNote]
    }
  }

  if (currentTask) {
    await updateTask(currentCtx.db, currentTask.id, data)
  } else {
    data.createdBy = currentCtx.currentUser?.email || ''
    await createTask(currentCtx.db, data)
  }

  close()
})

// Delete handler
deleteBtn.addEventListener('click', async () => {
  if (currentTask && confirm('Delete this task?')) {
    await deleteTask(currentCtx.db, currentTask.id)
    close()
  }
})

export function openModal(task, ctx) {
  currentTask = task
  currentCtx = ctx

  titleEl.textContent = task ? 'Edit Task' : 'New Task'
  deleteBtn.classList.toggle('hidden', !task)

  // Populate client dropdown
  const clientSelect = document.getElementById('task-client')
  clientSelect.innerHTML =
    '<option value="">No client</option>' +
    ctx.clients.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')

  // Populate project dropdown
  const projectSelect = document.getElementById('task-project')
  projectSelect.innerHTML =
    '<option value="">No project</option>' +
    ctx.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')

  // Populate assignees multi-select
  selectedAssignees = task?.assignees ? [...task.assignees] : (task?.assignee ? [task.assignee] : [])
  renderAssigneeSelector()

  // Fill form
  document.getElementById('task-title').value = task?.title || ''
  document.getElementById('task-description').value = task?.description || ''
  clientSelect.value = task?.clientId || ''
  projectSelect.value = task?.projectId || ''
  document.getElementById('task-status').value = task?.status || ctx.defaultStatus || 'todo'
  document.getElementById('task-priority').value = task?.priority || 'medium'
  document.getElementById('task-deadline').value = formatDateInput(task?.deadline)
  document.getElementById('task-notes').value = ''

  // Render existing notes
  const notesList = document.getElementById('task-notes-list')
  const notes = task?.notes || []
  if (notes.length > 0) {
    notesList.innerHTML = notes
      .slice()
      .reverse()
      .map(
        (n) => `
      <div class="note-item">
        <div class="note-meta">${esc(n.author)} &middot; ${formatNoteDate(n.timestamp)}</div>
        <div>${esc(n.text)}</div>
      </div>
    `
      )
      .join('')
  } else {
    notesList.innerHTML = ''
  }

  // Show modal
  overlay.classList.remove('hidden')
  document.getElementById('task-title').focus()
}

function renderAssigneeSelector() {
  const chipsEl = document.getElementById('task-assignees-chips')
  const dropdownEl = document.getElementById('task-assignees-dropdown')

  // Render chips for selected assignees
  if (selectedAssignees.length > 0) {
    chipsEl.innerHTML = selectedAssignees.map((email) => {
      const member = TEAM.find((m) => m.email === email)
      const name = member?.name || email
      const color = member?.color || '#6b7280'
      return `<span class="assignee-chip" data-email="${email}">
        <span class="assignee-chip-dot" style="background:${color}"></span>
        ${esc(name)}
        <button class="assignee-chip-remove" data-email="${email}">&times;</button>
      </span>`
    }).join('')
  } else {
    chipsEl.innerHTML = '<span class="assignee-placeholder">No assignees</span>'
  }

  // Render dropdown with checkboxes
  dropdownEl.innerHTML = TEAM.map((m) => {
    const checked = selectedAssignees.includes(m.email)
    const avatarHtml = m.photoURL
      ? `<img class="avatar-photo-xs" src="${m.photoURL}" alt="${m.name}">`
      : `<span class="avatar-xs" style="background:${m.color}">${m.name[0]}</span>`
    return `<label class="assignee-option${checked ? ' selected' : ''}">
      <input type="checkbox" value="${m.email}" ${checked ? 'checked' : ''}>
      ${avatarHtml}
      <span>${m.name}</span>
    </label>`
  }).join('')

  // Bind chip remove buttons
  chipsEl.querySelectorAll('.assignee-chip-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      selectedAssignees = selectedAssignees.filter((em) => em !== btn.dataset.email)
      renderAssigneeSelector()
    })
  })

  // Bind checkbox toggles
  dropdownEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (!selectedAssignees.includes(cb.value)) {
          selectedAssignees.push(cb.value)
        }
      } else {
        selectedAssignees = selectedAssignees.filter((em) => em !== cb.value)
      }
      renderAssigneeSelector()
    })
  })
}

function close() {
  overlay.classList.add('hidden')
  currentTask = null
  currentCtx = null
  selectedAssignees = []
}

function formatDateInput(deadline) {
  if (!deadline) return ''
  const d = deadline.toDate ? deadline.toDate() : deadline.seconds ? new Date(deadline.seconds * 1000) : new Date(deadline)
  return d.toISOString().split('T')[0]
}

function formatNoteDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function esc(str) {
  const el = document.createElement('span')
  el.textContent = str || ''
  return el.innerHTML
}
