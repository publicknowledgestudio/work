// Normalize anything date-like (Firestore Timestamp, { seconds }, Date, ISO string)
// into a JS Date, or null if absent.
export function toDate(ts) {
  if (!ts) return null
  if (ts.toDate) return ts.toDate()
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

// Render a deadline relative to today: Today / Tomorrow / Yesterday /
// Nd ago / Nd / "Mon 5". Returns '' when there is no deadline.
export function formatDeadline(deadline) {
  if (!deadline) return ''
  const d = toDate(deadline)
  const now = new Date()
  const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24))

  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff < -1) return `${Math.abs(diff)}d ago`
  if (diff <= 7) return `${diff}d`

  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

// "Mar 5" style short date — takes a Date, not a Timestamp.
export function formatShortDate(d) {
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}
