// Firebase configuration
// Replace these values with your Firebase project config
// from: Firebase Console > Project Settings > General > Your apps
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
}

// Team members
export const TEAM = [
  { email: 'gyan@publicknowledge.co', name: 'Gyan', color: '#4f46e5' },
  { email: 'charu@publicknowledge.co', name: 'Charu', color: '#0891b2' },
  { email: 'sharang@publicknowledge.co', name: 'Sharang', color: '#c026d3' },
  { email: 'anandu@publicknowledge.co', name: 'Anandu', color: '#ea580c' },
]

// Task statuses and their display config
export const STATUSES = [
  { id: 'backlog', label: 'Backlog', color: '#6b7280' },
  { id: 'todo', label: 'To Do', color: '#3b82f6' },
  { id: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { id: 'review', label: 'Review', color: '#8b5cf6' },
  { id: 'done', label: 'Done', color: '#22c55e' },
]

export const PRIORITIES = [
  { id: 'low', label: 'Low', color: '#6b7280' },
  { id: 'medium', label: 'Medium', color: '#3b82f6' },
  { id: 'high', label: 'High', color: '#f59e0b' },
  { id: 'urgent', label: 'Urgent', color: '#ef4444' },
]
