import { TEAM } from './config.js'
import {
  subscribeToPeople,
  createPerson,
  updatePerson,
  deletePerson,
  updatePersonContent,
} from './db.js'
import { renderMarkdown } from './markdown.js'

let unsubPeople = null
let localPeople = []
let currentCtx = null
let activePersonId = null
let activeTab = 'page' // 'page' | 'activity'
let isEditing = false

export function renderPeople(container, ctx) {
  // Clean up previous subscriptions
  if (unsubPeople) unsubPeople()
  currentCtx = ctx
  activePersonId = null
  isEditing = false

  container.innerHTML = `
    <div class="people-view">
      <div class="people-header">
        <h2>People</h2>
        <p>Team members &amp; external contacts</p>
      </div>

      <div class="people-layout">
        <!-- List panel -->
        <div class="people-list-panel" id="people-list-panel">
          <div class="people-sections">
            <div class="people-section">
              <div class="section-title-row">
                <h3 class="section-title">Internal Team</h3>
              </div>
              <div id="people-internal-list"></div>
            </div>

            <div class="people-section">
              <div class="section-title-row">
                <h3 class="section-title">External Contacts</h3>
                <button class="btn-primary" id="add-person-btn"><i class="ph ph-plus"></i> Contact</button>
              </div>
              <div id="add-person-form" class="inline-form hidden">
                <input type="text" id="new-person-name" class="form-input" placeholder="Full name">
                <input type="text" id="new-person-email" class="form-input" placeholder="Email (optional)">
                <input type="text" id="new-person-role" class="form-input" placeholder="Role (e.g. COO, Designer)">
                <input type="text" id="new-person-org" class="form-input" placeholder="Organization">
                <select id="new-person-client" class="form-select">
                  <option value="">No client link</option>
                </select>
                <div class="inline-form-actions">
                  <button class="btn-primary" id="save-person-btn">Add</button>
                  <button class="btn-ghost" id="cancel-person-btn">Cancel</button>
                </div>
              </div>
              <div id="people-external-list"></div>
            </div>
          </div>
        </div>

        <!-- Detail panel -->
        <div class="people-detail-panel hidden" id="people-detail-panel">
          <div id="people-detail-content"></div>
        </div>
      </div>
    </div>
  `

  // Subscribe to real-time updates
  unsubPeople = subscribeToPeople(ctx.db, (people) => {
    localPeople = people
    renderLists()
    // Re-render detail if someone is selected
    if (activePersonId) {
      const person = localPeople.find((p) => p.id === activePersonId)
      if (person) renderDetail(person)
    }
  })

  // Add person form
  const addBtn = document.getElementById('add-person-btn')
  const addForm = document.getElementById('add-person-form')
  const cancelBtn = document.getElementById('cancel-person-btn')
  const saveBtn = document.getElementById('save-person-btn')

  populateClientDropdown()

  addBtn.addEventListener('click', () => {
    addForm.classList.remove('hidden')
    document.getElementById('new-person-name').focus()
  })

  cancelBtn.addEventListener('click', () => {
    addForm.classList.add('hidden')
    clearPersonForm()
  })

  saveBtn.addEventListener('click', async () => {
    const name = document.getElementById('new-person-name').value.trim()
    if (!name) {
      document.getElementById('new-person-name').focus()
      return
    }
    const clientSelect = document.getElementById('new-person-client')
    const clientId = clientSelect.value

    await createPerson(ctx.db, {
      name,
      email: document.getElementById('new-person-email').value.trim(),
      type: 'external',
      role: document.getElementById('new-person-role').value.trim(),
      organization: document.getElementById('new-person-org').value.trim(),
      clientIds: clientId ? [clientId] : [],
    })

    addForm.classList.add('hidden')
    clearPersonForm()
  })

  // Enter key on name field
  document.getElementById('new-person-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBtn.click()
    if (e.key === 'Escape') cancelBtn.click()
  })
}

function clearPersonForm() {
  document.getElementById('new-person-name').value = ''
  document.getElementById('new-person-email').value = ''
  document.getElementById('new-person-role').value = ''
  document.getElementById('new-person-org').value = ''
  document.getElementById('new-person-client').value = ''
}

function populateClientDropdown() {
  const dropdown = document.getElementById('new-person-client')
  if (!dropdown || !currentCtx) return
  dropdown.innerHTML = '<option value="">No client link</option>'
  ;(currentCtx.clients || []).forEach((c) => {
    dropdown.innerHTML += `<option value="${c.id}">${esc(c.name)}</option>`
  })
}

function renderLists() {
  const internal = localPeople.filter((p) => p.type === 'internal')
  const external = localPeople.filter((p) => p.type !== 'internal')

  renderInternalList(internal)
  renderExternalList(external)
}

function renderInternalList(people) {
  const list = document.getElementById('people-internal-list')
  if (!list) return

  if (people.length === 0) {
    // Auto-populate from TEAM config
    list.innerHTML = TEAM.map((m) => {
      const avatarHtml = m.photoURL
        ? `<img class="avatar-photo-sm" src="${m.photoURL}" alt="${m.name}">`
        : `<span class="avatar-sm" style="background:${m.color}">${m.name[0]}</span>`
      return `
        <div class="person-row" data-email="${m.email}">
          ${avatarHtml}
          <div class="person-row-info">
            <span class="person-row-name">${esc(m.name)}</span>
            <span class="person-row-meta">${esc(m.email)}</span>
          </div>
        </div>
      `
    }).join('')

    // Clicking an un-created team member creates them on the fly
    list.querySelectorAll('.person-row').forEach((row) => {
      row.addEventListener('click', async () => {
        const email = row.dataset.email
        const member = TEAM.find((m) => m.email === email)
        if (!member) return

        // Check if already exists
        let person = localPeople.find((p) => p.email === email)
        if (!person) {
          const docRef = await createPerson(currentCtx.db, {
            name: member.name,
            email: member.email,
            type: 'internal',
            role: '',
            organization: 'Public Knowledge',
            photoURL: member.photoURL || '',
          })
          person = { id: docRef.id, name: member.name, email: member.email, type: 'internal', role: '', organization: 'Public Knowledge', content: '', tags: [], clientIds: [] }
        }
        openDetail(person)
      })
    })
    return
  }

  list.innerHTML = people.map((p) => {
    const member = TEAM.find((m) => m.email === p.email)
    const avatarHtml = (p.photoURL || member?.photoURL)
      ? `<img class="avatar-photo-sm" src="${p.photoURL || member.photoURL}" alt="${esc(p.name)}">`
      : `<span class="avatar-sm" style="background:${member?.color || '#6b7280'}">${(p.name || '?')[0]}</span>`
    const isActive = p.id === activePersonId
    return `
      <div class="person-row${isActive ? ' active' : ''}" data-id="${p.id}">
        ${avatarHtml}
        <div class="person-row-info">
          <span class="person-row-name">${esc(p.name)}</span>
          <span class="person-row-meta">${esc(p.role || p.email || '')}</span>
        </div>
      </div>
    `
  }).join('')

  bindPersonRows(list)
}

function renderExternalList(people) {
  const list = document.getElementById('people-external-list')
  if (!list) return

  if (people.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-text">No external contacts yet</div></div>'
    return
  }

  list.innerHTML = people.map((p) => {
    const client = p.clientIds?.length
      ? (currentCtx.clients || []).find((c) => c.id === p.clientIds[0])
      : null
    const logoHtml = client?.logoUrl
      ? `<img class="client-logo-xs" src="${client.logoUrl}" alt="${esc(client.name)}">`
      : `<span class="avatar-sm" style="background:#6b7280">${(p.name || '?')[0]}</span>`
    const isActive = p.id === activePersonId
    return `
      <div class="person-row${isActive ? ' active' : ''}" data-id="${p.id}">
        ${logoHtml}
        <div class="person-row-info">
          <span class="person-row-name">${esc(p.name)}</span>
          <span class="person-row-meta">${esc(p.role ? `${p.role}${p.organization ? ' · ' + p.organization : ''}` : p.organization || '')}</span>
        </div>
      </div>
    `
  }).join('')

  bindPersonRows(list)
}

function bindPersonRows(list) {
  list.querySelectorAll('.person-row[data-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const person = localPeople.find((p) => p.id === row.dataset.id)
      if (person) openDetail(person)
    })
  })
}

function openDetail(person) {
  activePersonId = person.id
  activeTab = 'page'
  isEditing = false

  // Mark active row
  document.querySelectorAll('.person-row').forEach((r) => {
    r.classList.toggle('active', r.dataset.id === person.id)
  })

  // Show detail panel
  const detailPanel = document.getElementById('people-detail-panel')
  detailPanel.classList.remove('hidden')

  // On small screens, hide the list panel
  const listPanel = document.getElementById('people-list-panel')
  listPanel.classList.add('detail-open')

  renderDetail(person)
}

function closeDetail() {
  activePersonId = null
  isEditing = false

  const detailPanel = document.getElementById('people-detail-panel')
  detailPanel.classList.add('hidden')

  const listPanel = document.getElementById('people-list-panel')
  listPanel.classList.remove('detail-open')

  document.querySelectorAll('.person-row').forEach((r) => r.classList.remove('active'))
}

function renderDetail(person) {
  const container = document.getElementById('people-detail-content')
  if (!container) return

  const member = TEAM.find((m) => m.email === person.email)
  const avatarHtml = (person.photoURL || member?.photoURL)
    ? `<img class="avatar-photo-lg" src="${person.photoURL || member.photoURL}" alt="${esc(person.name)}">`
    : `<span class="avatar-lg" style="background:${member?.color || '#6b7280'}">${(person.name || '?')[0]}</span>`

  const tags = (person.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')
  const client = person.clientIds?.length
    ? (currentCtx.clients || []).find((c) => c.id === person.clientIds[0])
    : null

  const orgLine = person.type === 'external'
    ? (client ? esc(client.name) : esc(person.organization || ''))
    : 'Public Knowledge'

  container.innerHTML = `
    <div class="person-detail">
      <div class="person-detail-header">
        <button class="btn-ghost person-back-btn" id="person-back-btn">
          <i class="ph ph-arrow-left"></i>
        </button>
        <div class="person-detail-identity">
          ${avatarHtml}
          <div>
            <h2 class="person-detail-name">${esc(person.name)}</h2>
            <p class="person-detail-role">${esc(person.role || '')}${orgLine ? (person.role ? ' · ' : '') + orgLine : ''}</p>
            ${person.email ? `<p class="person-detail-email">${esc(person.email)}</p>` : ''}
            ${tags ? `<div class="tag-list">${tags}</div>` : ''}
          </div>
        </div>
        <div class="person-detail-actions">
          <button class="btn-ghost" id="person-edit-meta-btn" title="Edit details"><i class="ph ph-pencil-simple"></i></button>
          ${person.type === 'external' ? `<button class="btn-ghost" id="person-delete-btn" title="Delete"><i class="ph ph-trash"></i></button>` : ''}
        </div>
      </div>

      <div class="tab-bar">
        <button class="tab${activeTab === 'page' ? ' active' : ''}" data-tab="page">Page</button>
        <button class="tab${activeTab === 'activity' ? ' active' : ''}" data-tab="activity">Activity</button>
      </div>

      <div class="tab-content" id="person-tab-content"></div>
    </div>
  `

  // Back button
  document.getElementById('person-back-btn').addEventListener('click', closeDetail)

  // Tab switching
  container.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab
      isEditing = false
      container.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === activeTab))
      renderTabContent(person)
    })
  })

  // Edit meta button
  const editMetaBtn = document.getElementById('person-edit-meta-btn')
  if (editMetaBtn) {
    editMetaBtn.addEventListener('click', () => renderEditMeta(person))
  }

  // Delete button
  const deleteBtn = document.getElementById('person-delete-btn')
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (confirm(`Delete "${person.name}"? This cannot be undone.`)) {
        await deletePerson(currentCtx.db, person.id)
        closeDetail()
      }
    })
  }

  renderTabContent(person)
}

function renderTabContent(person) {
  const container = document.getElementById('person-tab-content')
  if (!container) return

  if (activeTab === 'page') {
    renderPageTab(container, person)
  } else {
    renderActivityTab(container, person)
  }
}

function renderPageTab(container, person) {
  const content = person.content || ''
  const updatedBy = person.contentUpdatedBy || ''
  const updatedAt = person.contentUpdatedAt
  let metaLine = ''
  if (updatedBy) {
    const editor = TEAM.find((m) => m.email === updatedBy)
    const editorName = editor?.name || updatedBy
    const dateStr = updatedAt ? formatDate(updatedAt) : ''
    metaLine = `<div class="page-meta">Last edited by ${esc(editorName)}${dateStr ? ' · ' + dateStr : ''}</div>`
  }

  if (isEditing) {
    container.innerHTML = `
      <div class="page-editor">
        <textarea id="page-editor-textarea" class="page-editor-textarea" placeholder="Write about this person using markdown...">${esc(content)}</textarea>
        <div class="page-editor-actions">
          <button class="btn-primary" id="page-save-btn">Save</button>
          <button class="btn-ghost" id="page-cancel-btn">Cancel</button>
        </div>
      </div>
    `
    const textarea = document.getElementById('page-editor-textarea')
    textarea.focus()
    // Auto-resize
    textarea.style.height = Math.max(200, textarea.scrollHeight) + 'px'
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto'
      textarea.style.height = Math.max(200, textarea.scrollHeight) + 'px'
    })

    document.getElementById('page-save-btn').addEventListener('click', async () => {
      const newContent = textarea.value
      await updatePersonContent(
        currentCtx.db,
        person.id,
        newContent,
        currentCtx.currentUser?.email || ''
      )
      isEditing = false
      // Person will update via snapshot
    })

    document.getElementById('page-cancel-btn').addEventListener('click', () => {
      isEditing = false
      renderTabContent(person)
    })
  } else {
    if (content) {
      container.innerHTML = `
        <div class="page-display">
          ${metaLine}
          <div class="page-content">${renderMarkdown(content)}</div>
          <button class="btn-ghost page-edit-btn" id="page-edit-btn"><i class="ph ph-pencil-simple"></i> Edit</button>
        </div>
      `
    } else {
      container.innerHTML = `
        <div class="page-empty">
          <p>No content yet. Add notes, context, or details about this person.</p>
          <button class="btn-primary" id="page-edit-btn"><i class="ph ph-pencil-simple"></i> Start writing</button>
        </div>
      `
    }

    const editBtn = document.getElementById('page-edit-btn')
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        isEditing = true
        renderTabContent(person)
      })
    }
  }
}

function renderActivityTab(container, person) {
  const allTasks = currentCtx.allTasks || []

  // Find tasks assigned to this person (match by email)
  const personTasks = person.email
    ? allTasks.filter((t) => (t.assignees || []).includes(person.email))
    : []

  // Sort: active tasks first (not done), then done
  const active = personTasks.filter((t) => t.status !== 'done')
  const done = personTasks.filter((t) => t.status === 'done')

  if (personTasks.length === 0) {
    container.innerHTML = `
      <div class="page-empty">
        <p>No tasks assigned to ${esc(person.name)}.</p>
      </div>
    `
    return
  }

  let html = ''

  if (active.length > 0) {
    html += `<div class="activity-section">
      <h4 class="activity-section-title">Active Tasks (${active.length})</h4>
      ${active.map((t) => renderActivityTask(t)).join('')}
    </div>`
  }

  if (done.length > 0) {
    html += `<div class="activity-section">
      <h4 class="activity-section-title">Completed (${done.length})</h4>
      ${done.slice(0, 20).map((t) => renderActivityTask(t)).join('')}
      ${done.length > 20 ? `<div class="activity-more">+ ${done.length - 20} more</div>` : ''}
    </div>`
  }

  container.innerHTML = `<div class="activity-timeline">${html}</div>`
}

function renderActivityTask(task) {
  const statusIcons = {
    backlog: 'ph-prohibit',
    todo: 'ph-circle',
    in_progress: 'ph-circle-half',
    review: 'ph-fast-forward',
    done: 'ph-check-circle',
  }
  const icon = statusIcons[task.status] || 'ph-circle'
  const project = task.projectId
    ? (currentCtx.projects || []).find((p) => p.id === task.projectId)
    : null
  const client = task.clientId
    ? (currentCtx.clients || []).find((c) => c.id === task.clientId)
    : null
  const meta = [project?.name, client?.name].filter(Boolean).join(' · ')

  return `
    <div class="activity-task ${task.status === 'done' ? 'is-done' : ''}">
      <i class="ph ${icon} activity-task-icon status-${task.status}"></i>
      <div class="activity-task-info">
        <span class="activity-task-title">${esc(task.title)}</span>
        ${meta ? `<span class="activity-task-meta">${esc(meta)}</span>` : ''}
      </div>
      ${task.priority === 'urgent' || task.priority === 'high' ? `<span class="priority-badge priority-${task.priority}">${task.priority}</span>` : ''}
    </div>
  `
}

function renderEditMeta(person) {
  const container = document.getElementById('person-tab-content')
  if (!container) return

  const clients = currentCtx.clients || []
  const currentClientId = person.clientIds?.length ? person.clientIds[0] : ''

  container.innerHTML = `
    <div class="person-edit-meta">
      <div class="form-row">
        <label class="form-label">Name</label>
        <input type="text" id="edit-person-name" class="form-input" value="${esc(person.name || '')}">
      </div>
      <div class="form-row">
        <label class="form-label">Email</label>
        <input type="text" id="edit-person-email" class="form-input" value="${esc(person.email || '')}">
      </div>
      <div class="form-row">
        <label class="form-label">Role</label>
        <input type="text" id="edit-person-role" class="form-input" value="${esc(person.role || '')}">
      </div>
      <div class="form-row">
        <label class="form-label">Organization</label>
        <input type="text" id="edit-person-org" class="form-input" value="${esc(person.organization || '')}">
      </div>
      ${person.type === 'external' ? `
      <div class="form-row">
        <label class="form-label">Client Link</label>
        <select id="edit-person-client" class="form-select">
          <option value="">No client link</option>
          ${clients.map((c) => `<option value="${c.id}" ${c.id === currentClientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>` : ''}
      <div class="form-row">
        <label class="form-label">Tags (comma-separated)</label>
        <input type="text" id="edit-person-tags" class="form-input" value="${esc((person.tags || []).join(', '))}">
      </div>
      <div class="inline-form-actions">
        <button class="btn-primary" id="edit-person-save">Save</button>
        <button class="btn-ghost" id="edit-person-cancel">Cancel</button>
      </div>
    </div>
  `

  document.getElementById('edit-person-save').addEventListener('click', async () => {
    const data = {
      name: document.getElementById('edit-person-name').value.trim(),
      email: document.getElementById('edit-person-email').value.trim(),
      role: document.getElementById('edit-person-role').value.trim(),
      organization: document.getElementById('edit-person-org').value.trim(),
      tags: document.getElementById('edit-person-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
    }
    if (person.type === 'external') {
      const clientEl = document.getElementById('edit-person-client')
      data.clientIds = clientEl && clientEl.value ? [clientEl.value] : []
    }
    if (!data.name) {
      document.getElementById('edit-person-name').focus()
      return
    }
    await updatePerson(currentCtx.db, person.id, data)
    // Will re-render via snapshot
  })

  document.getElementById('edit-person-cancel').addEventListener('click', () => {
    activeTab = 'page'
    const personNow = localPeople.find((p) => p.id === person.id) || person
    renderDetail(personNow)
  })
}

function formatDate(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
}

function esc(str) {
  const el = document.createElement('span')
  el.textContent = str || ''
  return el.innerHTML
}

export function cleanupPeople() {
  if (unsubPeople) { unsubPeople(); unsubPeople = null }
  localPeople = []
  currentCtx = null
  activePersonId = null
  isEditing = false
}
