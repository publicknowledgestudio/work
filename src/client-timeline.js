import { STATUSES, TEAM } from './config.js'
import { updateTask } from './db.js'
import { openModal } from './modal.js'

export function renderClientTimeline(container, tasks, ctx) {
  container.innerHTML = '<div class="timeline-view"><p style="padding:20px;color:var(--text-secondary)">Timeline coming soon</p></div>'
}
