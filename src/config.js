// Firebase configuration
// Replace these values with your Firebase project config
// from: Firebase Console > Project Settings > General > Your apps
export const firebaseConfig = {
  apiKey: 'AIzaSyCz4ckSpkIiEBghgDMozhCwzw_EvYnBRC0',
  authDomain: 'workdotpk-a06dc.firebaseapp.com',
  projectId: 'workdotpk-a06dc',
  storageBucket: 'workdotpk-a06dc.firebasestorage.app',
  messagingSenderId: '764388053600',
  appId: '1:764388053600:web:2e761bac21bacc8d3de905',
}

// Team members
export const TEAM = [
  { email: 'gyan@publicknowledge.co', name: 'Gyan', color: '#4f46e5' },
  { email: 'charu@publicknowledge.co', name: 'Charu', color: '#0891b2' },
  { email: 'sharang@publicknowledge.co', name: 'Sharang', color: '#c026d3' },
  { email: 'anandu@publicknowledge.co', name: 'Anandu', color: '#ea580c' },
  { email: 'asty@publicknowledge.co', name: 'Asty', color: '#10b981' },
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
