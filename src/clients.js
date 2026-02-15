import {
  createClient,
  updateClient,
  deleteClient,
  createProject,
  updateProject,
  deleteProject,
  subscribeToClients,
  subscribeToProjects,
  uploadClientLogo,
} from './db.js'

let unsubClients = null
let unsubProjects = null
let localClients = []
let localProjects = []
let editingClientId = null
let editingProjectId = null

export function renderClients(container, ctx) {
  // Clean up previous subscriptions
  if (unsubClients) unsubClients()
  if (unsubProjects) unsubProjects()

  container.innerHTML = `
    <div class="clients-view">
      <div class="clients-header">
        <h2>Clients & Projects</h2>
        <p>Manage your clients and their projects</p>
      </div>

      <div class="clients-sections">
        <div class="clients-section">
          <div class="section-title-row">
            <h3 class="section-title">Clients</h3>
            <button class="btn-primary" id="add-client-btn"><i class="ph ph-plus"></i> Client</button>
          </div>
          <div id="add-client-form" class="inline-form hidden">
            <input type="text" id="new-client-name" class="form-input" placeholder="Client name">
            <div class="logo-upload-row">
              <label class="btn-ghost logo-upload-btn" id="logo-upload-label">
                <i class="ph ph-upload-simple"></i> <span id="logo-upload-text">Choose logo</span>
                <input type="file" id="new-client-logo" accept="image/*" class="hidden">
              </label>
              <img id="logo-preview" class="client-logo" style="display:none" alt="Preview">
              <button id="logo-clear" class="btn-ghost" style="display:none;font-size:12px;">Remove</button>
            </div>
            <div class="inline-form-actions">
              <button class="btn-primary" id="save-client-btn">Add</button>
              <button class="btn-ghost" id="cancel-client-btn">Cancel</button>
            </div>
          </div>
          <div id="clients-list"></div>
        </div>

        <div class="clients-section">
          <div class="section-title-row">
            <h3 class="section-title">Projects</h3>
            <button class="btn-primary" id="add-project-btn"><i class="ph ph-plus"></i> Project</button>
          </div>
          <div id="add-project-form" class="inline-form hidden">
            <input type="text" id="new-project-name" class="form-input" placeholder="Project name">
            <select id="new-project-client" class="form-select">
              <option value="">No client</option>
            </select>
            <div class="inline-form-actions">
              <button class="btn-primary" id="save-project-btn">Add</button>
              <button class="btn-ghost" id="cancel-project-btn">Cancel</button>
            </div>
          </div>
          <div id="projects-list"></div>
        </div>
      </div>
    </div>
  `

  // Subscribe to real-time updates
  unsubClients = subscribeToClients(ctx.db, (clients) => {
    localClients = clients
    renderClientsList()
    updateProjectClientDropdown()
  })

  unsubProjects = subscribeToProjects(ctx.db, (projects) => {
    localProjects = projects
    renderProjectsList()
    renderClientsList() // Re-render clients to update project counts
  })

  // Add client
  const addClientBtn = document.getElementById('add-client-btn')
  const addClientForm = document.getElementById('add-client-form')
  const newClientName = document.getElementById('new-client-name')
  const newClientLogo = document.getElementById('new-client-logo')
  const logoPreview = document.getElementById('logo-preview')
  const logoClear = document.getElementById('logo-clear')
  const logoUploadText = document.getElementById('logo-upload-text')
  const saveClientBtn = document.getElementById('save-client-btn')
  const cancelClientBtn = document.getElementById('cancel-client-btn')

  let selectedLogoFile = null
  let existingLogoUrl = ''

  newClientLogo.addEventListener('change', () => {
    const file = newClientLogo.files[0]
    if (file) {
      selectedLogoFile = file
      logoPreview.src = URL.createObjectURL(file)
      logoPreview.style.display = ''
      logoClear.style.display = ''
      logoUploadText.textContent = file.name
    }
  })

  logoClear.addEventListener('click', () => {
    selectedLogoFile = null
    existingLogoUrl = ''
    newClientLogo.value = ''
    logoPreview.style.display = 'none'
    logoClear.style.display = 'none'
    logoUploadText.textContent = 'Choose logo'
  })

  function resetLogoForm() {
    selectedLogoFile = null
    existingLogoUrl = ''
    newClientLogo.value = ''
    logoPreview.style.display = 'none'
    logoClear.style.display = 'none'
    logoUploadText.textContent = 'Choose logo'
  }

  addClientBtn.addEventListener('click', () => {
    editingClientId = null
    newClientName.value = ''
    resetLogoForm()
    addClientForm.classList.remove('hidden')
    saveClientBtn.textContent = 'Add'
    newClientName.focus()
  })

  cancelClientBtn.addEventListener('click', () => {
    addClientForm.classList.add('hidden')
    editingClientId = null
  })

  saveClientBtn.addEventListener('click', async () => {
    const name = newClientName.value.trim()
    if (!name) return
    saveClientBtn.disabled = true
    saveClientBtn.textContent = 'Saving...'

    try {
      if (editingClientId) {
        let logoUrl = existingLogoUrl
        if (selectedLogoFile) {
          logoUrl = await uploadClientLogo(selectedLogoFile, editingClientId)
        }
        await updateClient(ctx.db, editingClientId, { name, logoUrl })
        editingClientId = null
      } else {
        // Create first to get an ID, then upload logo
        const docRef = await createClient(ctx.db, { name, logoUrl: '' })
        if (selectedLogoFile) {
          const logoUrl = await uploadClientLogo(selectedLogoFile, docRef.id)
          await updateClient(ctx.db, docRef.id, { logoUrl })
        }
      }
    } catch (err) {
      console.error('Error saving client:', err)
    }

    newClientName.value = ''
    resetLogoForm()
    addClientForm.classList.add('hidden')
    saveClientBtn.disabled = false
    saveClientBtn.textContent = 'Add'
  })

  newClientName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveClientBtn.click()
    if (e.key === 'Escape') cancelClientBtn.click()
  })

  // Add project
  const addProjectBtn = document.getElementById('add-project-btn')
  const addProjectForm = document.getElementById('add-project-form')
  const newProjectName = document.getElementById('new-project-name')
  const newProjectClient = document.getElementById('new-project-client')
  const saveProjectBtn = document.getElementById('save-project-btn')
  const cancelProjectBtn = document.getElementById('cancel-project-btn')

  addProjectBtn.addEventListener('click', () => {
    editingProjectId = null
    newProjectName.value = ''
    newProjectClient.value = ''
    addProjectForm.classList.remove('hidden')
    saveProjectBtn.textContent = 'Add'
    newProjectName.focus()
  })

  cancelProjectBtn.addEventListener('click', () => {
    addProjectForm.classList.add('hidden')
    editingProjectId = null
  })

  saveProjectBtn.addEventListener('click', async () => {
    const name = newProjectName.value.trim()
    if (!name) return
    const clientId = newProjectClient.value
    if (editingProjectId) {
      await updateProject(ctx.db, editingProjectId, { name, clientId })
      editingProjectId = null
    } else {
      await createProject(ctx.db, { name, clientId })
    }
    newProjectName.value = ''
    newProjectClient.value = ''
    addProjectForm.classList.add('hidden')
  })

  newProjectName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveProjectBtn.click()
    if (e.key === 'Escape') cancelProjectBtn.click()
  })

  function updateProjectClientDropdown() {
    const dropdown = document.getElementById('new-project-client')
    if (!dropdown) return
    const val = dropdown.value
    dropdown.innerHTML = '<option value="">No client</option>'
    localClients.forEach((c) => {
      dropdown.innerHTML += `<option value="${c.id}">${c.name}</option>`
    })
    dropdown.value = val
  }

  function renderClientsList() {
    const list = document.getElementById('clients-list')
    if (!list) return

    if (localClients.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="empty-state-text">No clients yet</div></div>'
      return
    }

    list.innerHTML = localClients.map((c) => {
      const projectCount = localProjects.filter((p) => p.clientId === c.id).length
      const logo = c.logoUrl
        ? `<img class="client-logo" src="${c.logoUrl}" alt="${c.name}">`
        : `<span class="client-logo client-logo-placeholder">${c.name[0]}</span>`
      return `
        <div class="client-row" data-id="${c.id}">
          ${logo}
          <div class="client-row-info">
            <span class="client-row-name">${c.name}</span>
            <span class="client-row-meta">${projectCount} project${projectCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="client-row-actions">
            <button class="btn-ghost client-edit" data-id="${c.id}" data-name="${c.name}" data-logo="${c.logoUrl || ''}"><i class="ph ph-pencil-simple"></i></button>
            <button class="btn-ghost client-delete" data-id="${c.id}" data-name="${c.name}"><i class="ph ph-trash"></i></button>
          </div>
        </div>
      `
    }).join('')

    list.querySelectorAll('.client-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        editingClientId = btn.dataset.id
        newClientName.value = btn.dataset.name
        resetLogoForm()
        existingLogoUrl = btn.dataset.logo || ''
        if (existingLogoUrl) {
          logoPreview.src = existingLogoUrl
          logoPreview.style.display = ''
          logoClear.style.display = ''
          logoUploadText.textContent = 'Change logo'
        }
        addClientForm.classList.remove('hidden')
        saveClientBtn.textContent = 'Save'
        newClientName.focus()
      })
    })

    list.querySelectorAll('.client-delete').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (confirm(`Delete client "${btn.dataset.name}"? This won't delete associated tasks.`)) {
          await deleteClient(ctx.db, btn.dataset.id)
        }
      })
    })
  }

  function renderProjectsList() {
    const list = document.getElementById('projects-list')
    if (!list) return

    if (localProjects.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="empty-state-text">No projects yet</div></div>'
      return
    }

    list.innerHTML = localProjects.map((p) => {
      const client = localClients.find((c) => c.id === p.clientId)
      const logo = client?.logoUrl
        ? `<img class="client-logo-xs" src="${client.logoUrl}" alt="${client.name}">`
        : client
          ? `<span class="client-logo-xs client-logo-placeholder">${client.name[0]}</span>`
          : ''
      return `
        <div class="client-row" data-id="${p.id}">
          ${logo}
          <div class="client-row-info">
            <span class="client-row-name">${p.name}</span>
            <span class="client-row-meta">${client ? client.name : 'No client'}</span>
          </div>
          <div class="client-row-actions">
            <button class="btn-ghost project-edit" data-id="${p.id}" data-name="${p.name}" data-client="${p.clientId || ''}"><i class="ph ph-pencil-simple"></i></button>
            <button class="btn-ghost project-delete" data-id="${p.id}" data-name="${p.name}"><i class="ph ph-trash"></i></button>
          </div>
        </div>
      `
    }).join('')

    list.querySelectorAll('.project-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        editingProjectId = btn.dataset.id
        newProjectName.value = btn.dataset.name
        newProjectClient.value = btn.dataset.client
        addProjectForm.classList.remove('hidden')
        saveProjectBtn.textContent = 'Save'
        newProjectName.focus()
      })
    })

    list.querySelectorAll('.project-delete').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (confirm(`Delete project "${btn.dataset.name}"? This won't delete associated tasks.`)) {
          await deleteProject(ctx.db, btn.dataset.id)
        }
      })
    })
  }
}

export function cleanupClients() {
  if (unsubClients) { unsubClients(); unsubClients = null }
  if (unsubProjects) { unsubProjects(); unsubProjects = null }
}
