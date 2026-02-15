import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
  Timestamp,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'

// ===== Clients =====

export async function loadClients(db) {
  const snap = await getDocs(query(collection(db, 'clients'), orderBy('name')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function createClient(db, data) {
  return addDoc(collection(db, 'clients'), {
    name: data.name,
    logoUrl: data.logoUrl || '',
    createdAt: serverTimestamp(),
  })
}

export async function updateClient(db, clientId, data) {
  return updateDoc(doc(db, 'clients', clientId), data)
}

export async function deleteClient(db, clientId) {
  return deleteDoc(doc(db, 'clients', clientId))
}

export async function uploadClientLogo(file, clientId) {
  const storage = getStorage()
  const storageRef = ref(storage, `client-logos/${clientId}`)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

export function subscribeToClients(db, callback) {
  const q = query(collection(db, 'clients'), orderBy('name'))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  })
}

export function subscribeToProjects(db, callback) {
  const q = query(collection(db, 'projects'), orderBy('name'))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  })
}

export async function updateProject(db, projectId, data) {
  return updateDoc(doc(db, 'projects', projectId), data)
}

export async function deleteProject(db, projectId) {
  return deleteDoc(doc(db, 'projects', projectId))
}

// ===== Projects =====

export async function loadProjects(db) {
  const snap = await getDocs(query(collection(db, 'projects'), orderBy('name')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function createProject(db, data) {
  return addDoc(collection(db, 'projects'), {
    name: data.name,
    clientId: data.clientId || '',
    createdAt: serverTimestamp(),
  })
}

// ===== Tasks =====

// Backward compat: convert old `assignee` string to `assignees` array
export function normalizeTask(task) {
  if (!task.assignees) {
    task.assignees = task.assignee ? [task.assignee] : []
  }
  return task
}

export function subscribeToTasks(db, callback) {
  const q = query(collection(db, 'tasks'), orderBy('updatedAt', 'desc'))
  return onSnapshot(q, (snap) => {
    const tasks = snap.docs.map((d) => normalizeTask({ id: d.id, ...d.data() }))
    callback(tasks)
  })
}

export async function createTask(db, data) {
  const assignees = data.assignees || (data.assignee ? [data.assignee] : [])
  return addDoc(collection(db, 'tasks'), {
    title: data.title,
    description: data.description || '',
    clientId: data.clientId || '',
    projectId: data.projectId || '',
    assignees,
    status: data.status || 'todo',
    priority: data.priority || 'medium',
    deadline: data.deadline ? Timestamp.fromDate(new Date(data.deadline)) : null,
    notes: data.notes || [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    closedAt: null,
    createdBy: data.createdBy || '',
  })
}

export async function updateTask(db, taskId, data) {
  const update = { ...data, updatedAt: serverTimestamp() }

  // Set closedAt when moving to done
  if (data.status === 'done' && !data.closedAt) {
    update.closedAt = serverTimestamp()
  }
  // Clear closedAt when reopening
  if (data.status && data.status !== 'done') {
    update.closedAt = null
  }

  // Handle deadline conversion
  if (data.deadline !== undefined) {
    update.deadline = data.deadline ? Timestamp.fromDate(new Date(data.deadline)) : null
  }

  return updateDoc(doc(db, 'tasks', taskId), update)
}

export async function deleteTask(db, taskId) {
  return deleteDoc(doc(db, 'tasks', taskId))
}

// ===== Standups =====

export async function submitStandup(db, data) {
  return addDoc(collection(db, 'standups'), {
    userEmail: data.userEmail,
    userName: data.userName,
    yesterday: data.yesterday,
    today: data.today,
    blockers: data.blockers,
    date: serverTimestamp(),
  })
}

export async function loadStandups(db, limit = 20) {
  const q = query(collection(db, 'standups'), orderBy('date', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.slice(0, limit).map((d) => ({ id: d.id, ...d.data() }))
}

// ===== Notes (Granola / meeting notes) =====

export async function addNote(db, data) {
  return addDoc(collection(db, 'notes'), {
    content: data.content,
    source: data.source || 'manual',
    taskIds: data.taskIds || [],
    createdBy: data.createdBy || '',
    createdAt: serverTimestamp(),
  })
}
