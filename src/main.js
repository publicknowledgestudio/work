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
import { renderBoard, renderBoardByAssignee } from './board.js'
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
let currentView = 'board'
let boardSubView = 'status' // 'status' or 'assignee'
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
const filterClient = document.getElementById('filter-client')
const filterProject = document.getElementById('filter-project')
const filterAssignee = document.getElementById('filter-assignee')
const boardTab = document.getElementById('board-tab')
const boardDropdown = document.getElementById('board-dropdown')

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
  tab.addEventListener('click', (e) => {
    // For the board tab, toggle the dropdown instead of navigating directly
    if (tab.dataset.view === 'board') {
      // If already on board view, just toggle dropdown
      if (currentView === 'board') {
        boardDropdown.classList.toggle('show')
        e.stopPropagation()
        return
      }
    }
    currentView = tab.dataset.view
    navTabs.forEach((t) => t.classList.toggle('active', t === tab))
    boardDropdown.classList.remove('show')
    renderCurrentView()
  })
})

// Board dropdown items
boardDropdown.querySelectorAll('.nav-dropdown-item').forEach((item) => {
  item.addEventListener('click', (e) => {
    e.stopPropagation()
    boardSubView = item.dataset.boardView
    currentView = 'board'
    navTabs.forEach((t) => t.classList.toggle('active', t === boardTab))
    boardDropdown.querySelectorAll('.nav-dropdown-item').forEach((i) =>
      i.classList.toggle('active', i === item)
    )
    boardDropdown.classList.remove('show')

    // Update tab label
    const icon = item.dataset.boardView === 'assignee' ? 'ph-users' : 'ph-list-checks'
    const label = item.dataset.boardView === 'assignee' ? 'By Assignee' : 'By Status'
    boardTab.innerHTML = `<i class="ph ${icon}"></i> ${label} <span class="nav-caret">&#9662;</span>`

    renderCurrentView()
  })
})

// Close dropdown when clicking outside
document.addEventListener('click', () => {
  boardDropdown.classList.remove('show')
})

// Filters
filterClient.addEventListener('change', renderCurrentView)
filterProject.addEventListener('change', renderCurrentView)
filterAssignee.addEventListener('change', renderCurrentView)

// New Task
newTaskBtn.addEventListener('click', () => {
  openModal(null, { db, currentUser, clients, projects, onSave: renderCurrentView })
})

function populateFilters() {
  // Client filter
  filterClient.innerHTML = '<option value="">All Clients</option>'
  clients.forEach((c) => {
    filterClient.innerHTML += `<option value="${c.id}">${c.name}</option>`
  })

  // Project filter
  filterProject.innerHTML = '<option value="">All Projects</option>'
  projects.forEach((p) => {
    filterProject.innerHTML += `<option value="${p.id}">${p.name}</option>`
  })

  // Assignee filter
  filterAssignee.innerHTML = '<option value="">Everyone</option>'
  TEAM.forEach((m) => {
    filterAssignee.innerHTML += `<option value="${m.email}">${m.name}</option>`
  })
}

function getFilteredTasks() {
  let tasks = allTasks
  const clientId = filterClient.value
  const projectId = filterProject.value
  const assignee = filterAssignee.value

  if (clientId) tasks = tasks.filter((t) => t.clientId === clientId)
  if (projectId) tasks = tasks.filter((t) => t.projectId === projectId)
  if (assignee) tasks = tasks.filter((t) => t.assignee === assignee)

  return tasks
}

function renderCurrentView() {
  const tasks = getFilteredTasks()
  const ctx = {
    db, currentUser, clients, projects, allTasks, onSave: renderCurrentView,
    filterClientId: filterClient.value,
    filterProjectId: filterProject.value,
  }

  // Hide filters and new-task button on non-task views
  const filterGroup = document.getElementById('filter-group')
  const isTaskView = currentView === 'board' || currentView === 'my-tasks'
  filterGroup.style.display = isTaskView ? '' : 'none'
  newTaskBtn.style.display = isTaskView ? '' : 'none'

  // Clean up clients subscriptions when leaving that view
  if (currentView !== 'clients') cleanupClients()

  switch (currentView) {
    case 'board':
      if (boardSubView === 'assignee') {
        renderBoardByAssignee(mainContent, tasks, ctx)
      } else {
        renderBoard(mainContent, tasks, ctx)
      }
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
