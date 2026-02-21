import { loadAllDailyFocusForRange } from './db.js'
import { TEAM } from './config.js'

let currentClientId = ''
let currentMonth = '' // 'YYYY-MM'
let timesheetData = null

export async function renderTimesheets(container, tasks, ctx) {
  // Default to current month
  if (!currentMonth) {
    const now = new Date()
    currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  const clients = ctx.clients.filter((c) => c.name)

  container.innerHTML = `
    <div class="timesheets-view">
      <div class="timesheets-header">
        <h2>Timesheets</h2>
        <p>Generate timesheets from tracked time blocks</p>
      </div>

      <div class="timesheets-controls">
        <div class="timesheets-control-group">
          <label class="form-label">Client</label>
          <select id="ts-client" class="form-select">
            <option value="">Select a client...</option>
            ${clients.map((c) => `<option value="${c.id}"${c.id === currentClientId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="timesheets-control-group">
          <label class="form-label">Month</label>
          <input type="month" id="ts-month" class="form-input" value="${currentMonth}">
        </div>
        <div class="timesheets-control-group ts-generate-group">
          <button class="btn-ghost ts-print-btn hidden" id="ts-print">
            <i class="ph ph-printer"></i> Print
          </button>
        </div>
      </div>

      <div id="ts-result"></div>
    </div>
  `

  const clientSelect = document.getElementById('ts-client')
  const monthInput = document.getElementById('ts-month')
  const printBtn = document.getElementById('ts-print')

  clientSelect.addEventListener('change', () => {
    currentClientId = clientSelect.value
    autoGenerate(container, tasks, ctx)
  })

  monthInput.addEventListener('change', () => {
    currentMonth = monthInput.value
    autoGenerate(container, tasks, ctx)
  })

  printBtn.addEventListener('click', () => {
    window.print()
  })

  // Auto-generate if we already have a selection
  if (currentClientId && currentMonth) {
    autoGenerate(container, tasks, ctx)
  }
}

async function autoGenerate(container, tasks, ctx) {
  const resultEl = document.getElementById('ts-result')
  const printBtn = document.getElementById('ts-print')
  if (!resultEl) return

  if (!currentClientId) {
    timesheetData = null
    printBtn?.classList.add('hidden')
    resultEl.innerHTML = ''
    return
  }

  if (!currentMonth || !/^\d{4}-\d{2}$/.test(currentMonth)) {
    timesheetData = null
    printBtn?.classList.add('hidden')
    resultEl.innerHTML = '<div class="ts-empty">Please select a valid month.</div>'
    return
  }

  resultEl.innerHTML = '<div class="ts-loading"><i class="ph ph-spinner"></i> Loading...</div>'

  try {
    timesheetData = await generateTimesheet(ctx, tasks, currentClientId, currentMonth)
    renderTimesheetTable(resultEl, timesheetData, ctx)
    printBtn?.classList.toggle('hidden', timesheetData.lineItems.length === 0)
  } catch (err) {
    console.error('Timesheet generation error:', err)
    resultEl.innerHTML = '<div class="ts-empty">Error generating timesheet.</div>'
    printBtn?.classList.add('hidden')
  }
}

async function generateTimesheet(ctx, tasks, clientId, monthStr) {
  const [year, month] = monthStr.split('-').map(Number)
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // Get tasks belonging to this client (directly or via project)
  const clientProjectIds = new Set(
    ctx.projects.filter((p) => p.clientId === clientId).map((p) => p.id)
  )
  const clientTaskIds = new Set(
    tasks.filter((t) => t.clientId === clientId || (t.projectId && clientProjectIds.has(t.projectId))).map((t) => t.id)
  )

  // Load all dailyFocus docs for this date range
  const focusDocs = await loadAllDailyFocusForRange(ctx.db, startDate, endDate)

  // Aggregate time blocks per task
  const taskTimeMap = {} // taskId -> { totalMinutes, blocks: [...] }

  for (const doc of focusDocs) {
    const blocks = doc.timeBlocks || []
    for (const block of blocks) {
      if (!clientTaskIds.has(block.taskId)) continue

      if (!taskTimeMap[block.taskId]) {
        taskTimeMap[block.taskId] = { totalMinutes: 0, blocks: [] }
      }

      const minutes = durationMinutes(block.start, block.end)
      taskTimeMap[block.taskId].totalMinutes += minutes
      taskTimeMap[block.taskId].blocks.push({
        date: doc.date,
        start: block.start,
        end: block.end,
        userEmail: doc.userEmail,
        minutes,
      })
    }
  }

  // Build line items with per-task rate from project
  const client = ctx.clients.find((c) => c.id === clientId)
  const lineItems = Object.entries(taskTimeMap)
    .map(([taskId, data]) => {
      const task = tasks.find((t) => t.id === taskId)
      const project = task?.projectId ? ctx.projects.find((p) => p.id === task.projectId) : null
      const rate = project?.hourlyRate ?? client?.defaultHourlyRate ?? 0
      const currency = project?.currency || client?.currency || 'INR'
      return {
        taskId,
        title: task?.title || 'Unknown task',
        project: project?.name || '',
        totalMinutes: data.totalMinutes,
        rate,
        currency,
        blocks: data.blocks.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)),
      }
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes)

  const totalMinutes = lineItems.reduce((sum, item) => sum + item.totalMinutes, 0)
  const totalAmount = lineItems.reduce((sum, item) => sum + (item.totalMinutes / 60) * item.rate, 0)
  // Use the most common currency (or client default)
  const currency = client?.currency || 'INR'

  return {
    clientId,
    month: monthStr,
    startDate,
    endDate,
    lineItems,
    totalMinutes,
    totalAmount,
    currency,
  }
}

function renderTimesheetTable(container, data, ctx) {
  if (!data || data.lineItems.length === 0) {
    const client = ctx.clients.find((c) => c.id === data?.clientId)
    container.innerHTML = `
      <div class="ts-empty">
        <i class="ph ph-clipboard-text" style="font-size:32px;opacity:0.3"></i>
        <p>No tracked time found for ${esc(client?.name || 'this client')} in ${formatMonth(data?.month || '')}.</p>
        <p class="ts-empty-hint">Time blocks are created by dragging tasks onto the time grid in My Day.</p>
      </div>
    `
    return
  }

  const client = ctx.clients.find((c) => c.id === data.clientId)
  const hasRates = data.lineItems.some((item) => item.rate > 0)

  container.innerHTML = `
    <div class="ts-sheet">
      <div class="ts-sheet-header">
        <div class="ts-sheet-title">
          ${safeUrl(client?.logoUrl) ? `<img class="client-logo" src="${esc(safeUrl(client.logoUrl))}" alt="${esc(client.name)}">` : ''}
          <div>
            <h3>${esc(client?.name || 'Client')}</h3>
            <span class="ts-sheet-period">${formatMonth(data.month)}</span>
          </div>
        </div>
        <div class="ts-sheet-summary">
          <span class="ts-summary-item">${data.lineItems.length} task${data.lineItems.length !== 1 ? 's' : ''}</span>
          <span class="ts-summary-item">${formatDuration(data.totalMinutes)}</span>
          ${hasRates ? `<span class="ts-summary-total">${formatCurrency(data.totalAmount, data.currency)}</span>` : ''}
        </div>
      </div>

      <table class="ts-table">
        <thead>
          <tr>
            <th class="ts-col-num">#</th>
            <th class="ts-col-task">Task</th>
            <th class="ts-col-time">Time</th>
            ${hasRates ? '<th class="ts-col-amount">Amount</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${data.lineItems.map((item, i) => {
            const hours = item.totalMinutes / 60
            const amount = item.rate > 0 ? hours * item.rate : 0
            const timeDetail = item.blocks.map((b) => {
              const member = TEAM.find((m) => m.email === b.userEmail)
              const who = member ? member.name : ''
              return `${formatDateShort(b.date)}: ${fmtTime(b.start)}\u2013${fmtTime(b.end)} (${formatDuration(b.minutes)})${who ? ' \u00b7 ' + who : ''}`
            }).join('\n')
            return `
              <tr>
                <td class="ts-col-num">${i + 1}</td>
                <td class="ts-col-task">
                  <div class="ts-task-title">${esc(item.title)}</div>
                  ${item.project ? `<div class="ts-task-project">${esc(item.project)}</div>` : ''}
                </td>
                <td class="ts-col-time">
                  <span class="ts-duration">${formatDuration(item.totalMinutes)}</span>
                  <button class="btn-ghost ts-detail-toggle" title="Show breakdown">
                    <i class="ph ph-caret-down"></i>
                  </button>
                  <div class="ts-time-detail hidden">${esc(timeDetail)}</div>
                </td>
                ${hasRates ? `<td class="ts-col-amount">${item.rate > 0 ? formatCurrency(amount, item.currency) : ''}</td>` : ''}
              </tr>
            `
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="ts-total-row">
            <td colspan="2" class="ts-total-label">Total</td>
            <td class="ts-col-time"><strong>${formatDuration(data.totalMinutes)}</strong></td>
            ${hasRates ? `<td class="ts-col-amount"><strong>${formatCurrency(data.totalAmount, data.currency)}</strong></td>` : ''}
          </tr>
        </tfoot>
      </table>
    </div>
  `

  // Toggle detail breakdowns
  container.querySelectorAll('.ts-detail-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const detail = btn.parentElement.querySelector('.ts-time-detail')
      if (detail) {
        detail.classList.toggle('hidden')
        btn.querySelector('i').classList.toggle('ph-caret-down')
        btn.querySelector('i').classList.toggle('ph-caret-up')
      }
    })
  })
}

// ── Helpers ──

function durationMinutes(startStr, endStr) {
  const [sh, sm] = startStr.split(':').map(Number)
  const [eh, em] = endStr.split(':').map(Number)
  let diff = (eh * 60 + em) - (sh * 60 + sm)
  if (diff < 0) diff += 24 * 60
  return Math.max(0, diff)
}

function formatDuration(minutes) {
  if (minutes <= 0) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatCurrency(amount, currency) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatMonth(monthStr) {
  if (!monthStr) return ''
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 1)
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

function fmtTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

function safeUrl(url) {
  if (!url || typeof url !== 'string') return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return url
  } catch (_) { /* invalid URL */ }
  return null
}

function esc(str) {
  const el = document.createElement('span')
  el.textContent = str || ''
  return el.innerHTML
}
