import { initializeApp } from 'firebase/app'
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { firebaseConfig, TEAM } from './config.js'
import { loadClients, loadProjects, subscribeToTasks } from './db.js'
import { renderBoard, renderBoardByAssignee, renderBoardByClient, renderBoardByProject } from './board.js'
import { renderMyTasks } from './my-tasks.js'
import { renderStandup } from './standup.js'
import { renderClients, cleanupClients } from './clients.js'
import { openModal } from './modal.js'

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
export const db = getFirestore(app)

// State
let currentUser = null
let currentView = 'board-status'
let allTasks = []
let clients = []
let projects = []
let unsubTasks = null

// DOM refs
const loginScreen = document.getElementById('login-screen')
const appShell = document.getElementById('app-shell')
const loginBtn = document.getElementById('login-btn')
const logoutBtn = document.getElementById('logout-btn')
const userAvatar = document.getElementById('user-avatar')
const mainContent = document.getElementById('main-content')
const newTaskBtn = document.getElementById('new-task-btn')
const navTabs = document.querySelectorAll('.nav-tab')
const filterAssignee = document.getElementById('filter-assignee')

// Header project filter picker refs
const hfPicker = document.getElementById('header-project-filter')
const hfDisplay = document.getElementById('header-filter-display')
const hfText = document.getElementById('header-filter-text')
const hfClear = document.getElementById('header-filter-clear')
const hfDropdown = document.getElementById('header-filter-dropdown')
const hfSearch = document.getElementById('header-filter-search')
const hfList = document.getElementById('header-filter-list')

// Filter state — multiselect: set of selected project IDs
let selectedFilterIds = new Set()

// Auth
const provider = new GoogleAuthProvider()
provider.setCustomParameters({ hd: 'publicknowledge.co' })

loginBtn.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, provider)
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      console.error('Login error:', err)
    }
  }
})

logoutBtn.addEventListener('click', () => signOut(auth))

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user
    loginScreen.classList.add('hidden')
    appShell.classList.remove('hidden')

    // Set avatar — use Google photo
    const member = TEAM.find((m) => m.email === user.email)
    if (user.photoURL) {
      userAvatar.innerHTML = `<img class="avatar-photo-sm" src="${user.photoURL}" alt="${user.displayName || ''}">`
      userAvatar.style.background = 'none'
      // Store photoURL on the TEAM member for use in board/standup
      if (member) member.photoURL = user.photoURL
    } else {
      const initial = (user.displayName || user.email)[0].toUpperCase()
      userAvatar.textContent = initial
      userAvatar.style.background = member?.color || '#6b7280'
    }

    // Load reference data
    clients = await loadClients(db)
    projects = await loadProjects(db)
    populateFilters()

    // Subscribe to tasks (real-time)
    unsubTasks = subscribeToTasks(db, (tasks) => {
      allTasks = tasks
      renderCurrentView()
    })

    renderCurrentView()
  } else {
    currentUser = null
    loginScreen.classList.remove('hidden')
    appShell.classList.add('hidden')
    if (unsubTasks) {
      unsubTasks()
      unsubTasks = null
    }
  }
})

// Navigation
navTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    currentView = tab.dataset.view
    navTabs.forEach((t) => t.classList.toggle('active', t === tab))
    renderCurrentView()
  })
})

// Filters
filterAssignee.addEventListener('change', renderCurrentView)

// Header project filter picker (multiselect)
hfDisplay.addEventListener('click', () => {
  if (hfDropdown.classList.contains('hidden')) {
    openHeaderFilter()
  } else {
    closeHeaderFilter()
  }
})

hfClear.addEventListener('click', (e) => {
  e.stopPropagation()
  selectedFilterIds.clear()
  updateHeaderFilterDisplay()
  renderCurrentView()
})

hfSearch.addEventListener('input', () => {
  renderHeaderFilterList(hfSearch.value.trim())
})

document.addEventListener('mousedown', (e) => {
  if (!hfPicker.contains(e.target) && !hfDropdown.classList.contains('hidden')) {
    closeHeaderFilter()
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !hfDropdown.classList.contains('hidden')) {
    closeHeaderFilter()
  }
})

function openHeaderFilter() {
  hfDropdown.classList.remove('hidden')
  hfPicker.classList.add('open')
  hfSearch.value = ''
  renderHeaderFilterList('')
  hfSearch.focus()
}

function closeHeaderFilter() {
  hfDropdown.classList.add('hidden')
  hfPicker.classList.remove('open')
}

function toggleProject(projectId) {
  if (selectedFilterIds.has(projectId)) {
    selectedFilterIds.delete(projectId)
  } else {
    selectedFilterIds.add(projectId)
  }
  updateHeaderFilterDisplay()
  renderHeaderFilterList(hfSearch.value.trim())
  renderCurrentView()
}

function toggleClient(clientId) {
  const clientProjects = projects.filter((p) => p.clientId === clientId)
  const allSelected = clientProjects.length > 0 && clientProjects.every((p) => selectedFilterIds.has(p.id))
  clientProjects.forEach((p) => {
    if (allSelected) {
      selectedFilterIds.delete(p.id)
    } else {
      selectedFilterIds.add(p.id)
    }
  })
  updateHeaderFilterDisplay()
  renderHeaderFilterList(hfSearch.value.trim())
  renderCurrentView()
}

function updateHeaderFilterDisplay() {
  const count = selectedFilterIds.size
  if (count === 0) {
    hfText.textContent = 'All Projects'
    hfText.classList.remove('active')
    hfClear.classList.add('hidden')
  } else if (count === 1) {
    const id = [...selectedFilterIds][0]
    const project = projects.find((p) => p.id === id)
    hfText.textContent = project?.name || '1 project'
    hfText.classList.add('active')
    hfClear.classList.remove('hidden')
  } else {
    hfText.textContent = `${count} projects`
    hfText.classList.add('active')
    hfClear.classList.remove('hidden')
  }
}

function renderHeaderFilterList(query) {
  const q = query.toLowerCase()

  // Build grouped list: clients with their projects
  const grouped = []

  clients.forEach((client) => {
    const clientProjects = projects
      .filter((p) => p.clientId === client.id)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || client.name.toLowerCase().includes(q))
    if (clientProjects.length > 0) {
      grouped.push({ client, projects: clientProjects })
    }
  })

  // Projects without a client
  const uncategorized = projects
    .filter((p) => !p.clientId)
    .filter((p) => !q || p.name.toLowerCase().includes(q))

  let html = ''

  // Client groups with projects
  grouped.forEach((group) => {
    const logoHtml = group.client.logoUrl
      ? `<img src="${group.client.logoUrl}" alt="${esc(group.client.name)}">`
      : ''
    const allClientSelected = group.projects.length > 0 && group.projects.every((p) => selectedFilterIds.has(p.id))
    const someClientSelected = !allClientSelected && group.projects.some((p) => selectedFilterIds.has(p.id))
    const checkClass = allClientSelected ? 'checked' : (someClientSelected ? 'partial' : '')
    html += `<div class="header-filter-client" data-client-id="${group.client.id}">
      <span class="header-filter-checkbox ${checkClass}"></span>
      ${logoHtml}
      <span class="header-filter-client-name">${esc(group.client.name)}</span>
    </div>`
    group.projects.forEach((p) => {
      const isSelected = selectedFilterIds.has(p.id)
      html += `<div class="header-filter-option${isSelected ? ' selected' : ''}" data-project-id="${p.id}">
        <span class="header-filter-checkbox ${isSelected ? 'checked' : ''}"></span>
        ${esc(p.name)}
      </div>`
    })
  })

  // Uncategorized projects
  if (uncategorized.length > 0) {
    html += `<div class="header-filter-group-label">Uncategorized</div>`
    uncategorized.forEach((p) => {
      const isSelected = selectedFilterIds.has(p.id)
      html += `<div class="header-filter-option${isSelected ? ' selected' : ''}" data-project-id="${p.id}">
        <span class="header-filter-checkbox ${isSelected ? 'checked' : ''}"></span>
        ${esc(p.name)}
      </div>`
    })
  }

  if (!html || (q && grouped.length === 0 && uncategorized.length === 0)) {
    html = '<div class="header-filter-no-results">No matching projects</div>'
  }

  hfList.innerHTML = html

  // Bind project clicks
  hfList.querySelectorAll('.header-filter-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      toggleProject(opt.dataset.projectId)
    })
  })

  // Bind client clicks (toggle all projects in client)
  hfList.querySelectorAll('.header-filter-client').forEach((opt) => {
    opt.addEventListener('click', () => {
      toggleClient(opt.dataset.clientId)
    })
  })
}

// New Task
newTaskBtn.addEventListener('click', () => {
  openModal(null, { db, currentUser, clients, projects, onSave: renderCurrentView })
})

function populateFilters() {
  // Assignee filter
  filterAssignee.innerHTML = '<option value="">Everyone</option>'
  TEAM.forEach((m) => {
    filterAssignee.innerHTML += `<option value="${m.email}">${m.name}</option>`
  })
  // Reset header filter state
  selectedFilterIds.clear()
  updateHeaderFilterDisplay()
}

function esc(str) {
  const el = document.createElement('span')
  el.textContent = str || ''
  return el.innerHTML
}

function getFilteredTasks() {
  let tasks = allTasks
  const assignee = filterAssignee.value

  if (selectedFilterIds.size > 0) {
    tasks = tasks.filter((t) => selectedFilterIds.has(t.projectId))
  }
  if (assignee) tasks = tasks.filter((t) => (t.assignees || []).includes(assignee))

  return tasks
}

function renderCurrentView() {
  const tasks = getFilteredTasks()
  const ctx = {
    db, currentUser, clients, projects, allTasks, onSave: renderCurrentView,
    filterClientId: '',
    filterProjectId: '',
  }

  // Hide filters and new-task button on non-task views
  const filterGroup = document.getElementById('filter-group')
  const isBoardView = currentView.startsWith('board-')
  const isTaskView = isBoardView || currentView === 'my-tasks'
  filterGroup.style.display = isTaskView ? '' : 'none'
  newTaskBtn.style.display = isTaskView ? '' : 'none'

  // Clean up clients subscriptions when leaving that view
  if (currentView !== 'clients') cleanupClients()

  switch (currentView) {
    case 'board-status':
      renderBoard(mainContent, tasks, ctx)
      break
    case 'board-assignee':
      renderBoardByAssignee(mainContent, tasks, ctx)
      break
    case 'board-client':
      renderBoardByClient(mainContent, tasks, ctx)
      break
    case 'board-project':
      renderBoardByProject(mainContent, tasks, ctx)
      break
    case 'my-tasks':
      renderMyTasks(mainContent, tasks, currentUser, ctx)
      break
    case 'standup':
      renderStandup(mainContent, allTasks, ctx)
      break
    case 'clients':
      renderClients(mainContent, ctx)
      break
  }
}
