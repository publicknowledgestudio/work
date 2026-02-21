import { loadAllDailyFocusForRange, updateClient } from './db.js'
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

  const clients = ctx.clients.filter((c) => c.name) // skip empty

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
        <div class="timesheets-control-group">
          <label class="form-label">Hourly Rate</label>
          <div class="ts-rate-row">
            <input type="number" id="ts-rate" class="form-input ts-rate-input" placeholder="0" min="0" step="1"
              value="${currentClientId ? (ctx.clients.find((c) => c.id === currentClientId)?.hourlyRate || '') : ''}">
            <button class="btn-ghost ts-rate-save hidden" id="ts-rate-save">Save</button>
          </div>
        </div>
        <div class="timesheets-control-group ts-generate-group">
          <button class="btn-primary ts-generate-btn" id="ts-generate">
            <i class="ph ph-file-text"></i> Generate
          </button>
        </div>
      </div>

      <div id="ts-result"></div>
    </div>
  `

  // Bind controls
  const clientSelect = document.getElementById('ts-client')
  const monthInput = document.getElementById('ts-month')
  const rateInput = document.getElementById('ts-rate')
  const rateSaveBtn = document.getElementById('ts-rate-save')
  const generateBtn = document.getElementById('ts-generate')

  clientSelect.addEventListener('change', () => {
    currentClientId = clientSelect.value
    const client = ctx.clients.find((c) => c.id === currentClientId)
    rateInput.value = client?.hourlyRate || ''
    rateSaveBtn.classList.add('hidden')
    timesheetData = null
    document.getElementById('ts-result').innerHTML = ''
  })

  monthInput.addEventListener('change', () => {
    currentMonth = monthInput.value
    timesheetData = null
    document.getElementById('ts-result').innerHTML = ''
  })

  rateInput.addEventListener('input', () => {
    const client = ctx.clients.find((c) => c.id === currentClientId)
    const currentRate = client?.hourlyRate || ''
    if (rateInput.value !== String(currentRate)) {
      rateSaveBtn.classList.remove('hidden')
    } else {
      rateSaveBtn.classList.add('hidden')
    }
  })

  rateSaveBtn.addEventListener('click', async () => {
    if (!currentClientId) return
    const newRate = parseFloat(rateInput.value) || 0
    const client = ctx.clients.find((c) => c.id === currentClientId)
    const rateHistory = client?.rateHistory || []

    // Add current rate to history before changing
    if (client?.hourlyRate && client.hourlyRate !== newRate) {
      rateHistory.push({
        rate: client.hourlyRate,
        effectiveFrom: client.rateEffectiveFrom || '2020-01-01',
        effectiveUntil: new Date().toISOString().split('T')[0],
      })
    }

    await updateClient(ctx.db, currentClientId, {
      hourlyRate: newRate,
      rateEffectiveFrom: new Date().toISOString().split('T')[0],
      rateHistory,
    })

    // Update local reference
    if (client) {
      client.hourlyRate = newRate
      client.rateHistory = rateHistory
    }
    rateSaveBtn.classList.add('hidden')

    // Re-render table if visible
    if (timesheetData) {
      renderTimesheetTable(document.getElementById('ts-result'), timesheetData, newRate, ctx)
    }
  })

  generateBtn.addEventListener('click', async () => {
    if (!currentClientId) {
      document.getElementById('ts-result').innerHTML = '<div class="ts-empty">Please select a client.</div>'
      return
    }

    generateBtn.disabled = true
    generateBtn.innerHTML = '<i class="ph ph-spinner"></i> Loading...'

    try {
      timesheetData = await generateTimesheet(ctx, tasks, currentClientId, currentMonth)
      const client = ctx.clients.find((c) => c.id === currentClientId)
      const rate = parseFloat(rateInput.value) || client?.hourlyRate || 0
      renderTimesheetTable(document.getElementById('ts-result'), timesheetData, rate, ctx)
    } catch (err) {
      console.error('Timesheet generation error:', err)
      document.getElementById('ts-result').innerHTML = '<div class="ts-empty">Error generating timesheet.</div>'
    }

    generateBtn.disabled = false
    generateBtn.innerHTML = '<i class="ph ph-file-text"></i> Generate'
  })

  // If we had previous data, re-render
  if (timesheetData && currentClientId) {
    const client = ctx.clients.find((c) => c.id === currentClientId)
    const rate = client?.hourlyRate || 0
    renderTimesheetTable(document.getElementById('ts-result'), timesheetData, rate, ctx)
  }
}

async function generateTimesheet(ctx, tasks, clientId, monthStr) {
  const [year, month] = monthStr.split('-').map(Number)
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // Get tasks belonging to this client
  const clientTaskIds = new Set(
    tasks.filter((t) => t.clientId === clientId).map((t) => t.id)
  )

  // Also include tasks whose project belongs to this client
  const clientProjectIds = new Set(
    ctx.projects.filter((p) => p.clientId === clientId).map((p) => p.id)
  )
  tasks.forEach((t) => {
    if (t.projectId && clientProjectIds.has(t.projectId)) {
      clientTaskIds.add(t.id)
    }
  })

  // Load all dailyFocus docs for this date range
  const focusDocs = await loadAllDailyFocusForRange(ctx.db, startDate, endDate)

  // Aggregate time blocks per task
  const taskTimeMap = {} // taskId -> { totalMinutes, blocks: [{date, start, end}] }

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

  // Build line items
  const lineItems = Object.entries(taskTimeMap)
    .map(([taskId, data]) => {
      const task = tasks.find((t) => t.id === taskId)
      const project = task?.projectId ? ctx.projects.find((p) => p.id === task.projectId) : null
      return {
        taskId,
        title: task?.title || 'Unknown task',
        project: project?.name || '',
        totalMinutes: data.totalMinutes,
        blocks: data.blocks.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)),
      }
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes)

  const totalMinutes = lineItems.reduce((sum, item) => sum + item.totalMinutes, 0)

  return {
    clientId,
    month: monthStr,
    startDate,
    endDate,
    lineItems,
    totalMinutes,
  }
}

function renderTimesheetTable(container, data, hourlyRate, ctx) {
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
  const totalHours = data.totalMinutes / 60
  const subtotal = hourlyRate > 0 ? totalHours * hourlyRate : 0

  container.innerHTML = `
    <div class="ts-sheet">
      <div class="ts-sheet-header">
        <div class="ts-sheet-title">
          ${client?.logoUrl ? `<img class="client-logo" src="${client.logoUrl}" alt="${esc(client.name)}">` : ''}
          <div>
            <h3>${esc(client?.name || 'Client')}</h3>
            <span class="ts-sheet-period">${formatMonth(data.month)}</span>
          </div>
        </div>
        <div class="ts-sheet-summary">
          <span class="ts-summary-item">${data.lineItems.length} task${data.lineItems.length !== 1 ? 's' : ''}</span>
          <span class="ts-summary-item">${formatDuration(data.totalMinutes)}</span>
          ${hourlyRate > 0 ? `<span class="ts-summary-total">${formatCurrency(subtotal)}</span>` : ''}
        </div>
      </div>

      <table class="ts-table">
        <thead>
          <tr>
            <th class="ts-col-num">#</th>
            <th class="ts-col-task">Task</th>
            <th class="ts-col-time">Time</th>
            ${hourlyRate > 0 ? '<th class="ts-col-amount">Amount</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${data.lineItems.map((item, i) => {
            const hours = item.totalMinutes / 60
            const amount = hourlyRate > 0 ? hours * hourlyRate : 0
            const timeDetail = item.blocks.map((b) => {
              const member = TEAM.find((m) => m.email === b.userEmail)
              const who = member ? member.name : ''
              return `${formatDateShort(b.date)}: ${fmtTime(b.start)}–${fmtTime(b.end)} (${formatDuration(b.minutes)})${who ? ' · ' + who : ''}`
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
                ${hourlyRate > 0 ? `<td class="ts-col-amount">${formatCurrency(amount)}</td>` : ''}
              </tr>
            `
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="ts-total-row">
            <td colspan="2" class="ts-total-label">Total</td>
            <td class="ts-col-time"><strong>${formatDuration(data.totalMinutes)}</strong></td>
            ${hourlyRate > 0 ? `<td class="ts-col-amount"><strong>${formatCurrency(subtotal)}</strong></td>` : ''}
          </tr>
          ${hourlyRate > 0 ? `
          <tr class="ts-rate-row">
            <td colspan="${hourlyRate > 0 ? 4 : 3}" class="ts-rate-note">
              Rate: ${formatCurrency(hourlyRate)}/hr
            </td>
          </tr>
          ` : ''}
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
  return (eh * 60 + em) - (sh * 60 + sm)
}

function formatDuration(minutes) {
  if (minutes <= 0) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
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

function esc(str) {
  const el = document.createElement('span')
  el.textContent = str || ''
  return el.innerHTML
}
