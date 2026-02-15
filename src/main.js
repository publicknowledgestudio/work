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
import { renderBoard } from './board.js'
import { renderMyTasks } from './my-tasks.js'
import { renderStandup } from './standup.js'
import { openModal } from './modal.js'

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
export const db = getFirestore(app)

// State
let currentUser = null
let currentView = 'board'
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

    // Set avatar
    const member = TEAM.find((m) => m.email === user.email)
    const initial = (user.displayName || user.email)[0].toUpperCase()
    userAvatar.textContent = initial
    userAvatar.style.background = member?.color || '#6b7280'

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
  const ctx = { db, currentUser, clients, projects, allTasks, onSave: renderCurrentView }

  switch (currentView) {
    case 'board':
      renderBoard(mainContent, tasks, ctx)
      break
    case 'my-tasks':
      renderMyTasks(mainContent, tasks, currentUser, ctx)
      break
    case 'standup':
      renderStandup(mainContent, db, currentUser)
      break
  }
}
