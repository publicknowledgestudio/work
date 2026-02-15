import { TEAM } from './config.js'
import { submitStandup, loadStandups } from './db.js'

export async function renderStandup(container, db, currentUser) {
  container.innerHTML = `
    <div class="standup-view">
      <div class="standup-header">
        <h2>Daily Standup</h2>
        <p>Share what you're working on with the team</p>
      </div>
      <form class="standup-form" id="standup-form">
        <div class="standup-field">
          <label>Yesterday — What did you work on?</label>
          <textarea class="form-textarea" id="standup-yesterday" rows="3" placeholder="I worked on..."></textarea>
        </div>
        <div class="standup-field">
          <label>Today — What's the plan?</label>
          <textarea class="form-textarea" id="standup-today" rows="3" placeholder="Today I'll be..."></textarea>
        </div>
        <div class="standup-field">
          <label>Blockers — Anything in the way?</label>
          <textarea class="form-textarea" id="standup-blockers" rows="2" placeholder="No blockers / I'm stuck on..."></textarea>
        </div>
        <div class="standup-submit">
          <button type="submit" class="btn-primary">Submit Standup</button>
        </div>
      </form>
      <div class="standup-history" id="standup-history">
        <div class="standup-history-title">Recent Standups</div>
        <div id="standup-list"></div>
      </div>
    </div>`

  // Load history
  const standups = await loadStandups(db)
  renderStandupHistory(standups)

  // Submit handler
  document.getElementById('standup-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const yesterday = document.getElementById('standup-yesterday').value.trim()
    const today = document.getElementById('standup-today').value.trim()
    const blockers = document.getElementById('standup-blockers').value.trim()

    if (!yesterday && !today) return

    const member = TEAM.find((m) => m.email === currentUser.email)
    await submitStandup(db, {
      userEmail: currentUser.email,
      userName: member?.name || currentUser.displayName || currentUser.email,
      yesterday,
      today,
      blockers,
    })

    // Clear form and reload
    document.getElementById('standup-yesterday').value = ''
    document.getElementById('standup-today').value = ''
    document.getElementById('standup-blockers').value = ''

    const updated = await loadStandups(db)
    renderStandupHistory(updated)
  })
}

function renderStandupHistory(standups) {
  const list = document.getElementById('standup-list')
  if (!list) return

  if (standups.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-text">No standups yet</div></div>'
    return
  }

  list.innerHTML = standups
    .map((s) => {
      const member = TEAM.find((m) => m.email === s.userEmail)
      const date = s.date?.toDate
        ? s.date.toDate().toLocaleDateString('en-IN', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })
        : ''

      return `
      <div class="standup-entry">
        <div class="standup-entry-header">
          <span class="avatar-xs" style="background:${member?.color || '#6b7280'}">${(member?.name || s.userName || '?')[0]}</span>
          <span class="standup-entry-name">${esc(s.userName || s.userEmail)}</span>
          <span class="standup-entry-date">${date}</span>
        </div>
        ${s.yesterday ? `<div class="standup-entry-section"><div class="standup-entry-label">Yesterday</div><div class="standup-entry-text">${esc(s.yesterday)}</div></div>` : ''}
        ${s.today ? `<div class="standup-entry-section"><div class="standup-entry-label">Today</div><div class="standup-entry-text">${esc(s.today)}</div></div>` : ''}
        ${s.blockers ? `<div class="standup-entry-section"><div class="standup-entry-label">Blockers</div><div class="standup-entry-text">${esc(s.blockers)}</div></div>` : ''}
      </div>`
    })
    .join('')
}

function esc(str) {
  const el = document.createElement('span')
  el.textContent = str || ''
  return el.innerHTML
}
