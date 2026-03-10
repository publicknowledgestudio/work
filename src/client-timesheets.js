import { loadAllDailyFocusForRange } from './db.js'

let currentMonth = ''

export async function renderClientTimesheets(container, tasks, ctx) {
  const clientId = ctx.userClientId

  if (!currentMonth) {
    const now = new Date()
    currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  container.innerHTML = `
    <div class="timesheets-view">
      <div class="timesheets-header">
        <h2>Timesheets</h2>
        <p>Time tracked for your projects</p>
      </div>
      <div class="timesheets-controls">
        <div class="timesheets-control-group">
          <label class="form-label">Month</label>
          <input type="month" id="cts-month" class="form-input" value="${currentMonth}">
        </div>
        <div class="timesheets-control-group ts-generate-group">
          <button class="btn-ghost ts-print-btn hidden" id="cts-print">
            <i class="ph ph-printer"></i> Print
          </button>
        </div>
      </div>
      <div id="cts-result"></div>
    </div>
  `

  const monthInput = document.getElementById('cts-month')
  const printBtn = document.getElementById('cts-print')

  monthInput.addEventListener('change', () => {
    currentMonth = monthInput.value
    generate(container, tasks, ctx, clientId)
  })

  printBtn.addEventListener('click', () => window.print())

  generate(container, tasks, ctx, clientId)
}

async function generate(container, tasks, ctx, clientId) {
  const resultEl = document.getElementById('cts-result')
  const printBtn = document.getElementById('cts-print')
  if (!resultEl) return

  if (!currentMonth || !/^\d{4}-\d{2}$/.test(currentMonth)) {
    resultEl.innerHTML = '<div class="ts-empty">Please select a valid month.</div>'
    printBtn?.classList.add('hidden')
    return
  }

  resultEl.innerHTML = '<div class="ts-loading"><i class="ph ph-spinner"></i> Loading...</div>'

  try {
    const data = await generateTimesheet(ctx, tasks, clientId, currentMonth)
    renderTable(resultEl, data, ctx)
    printBtn?.classList.toggle('hidden', data.lineItems.length === 0)
  } catch (err) {
    console.error('Client timesheet error:', err)
    resultEl.innerHTML = '<div class="ts-empty">Error generating timesheet.</div>'
    printBtn?.classList.add('hidden')
  }
}

async function generateTimesheet(ctx, tasks, clientId, monthStr) {
  const [year, month] = monthStr.split('-').map(Number)
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const clientProjectIds = new Set(
    ctx.projects.filter((p) => p.clientId === clientId).map((p) => p.id)
  )
  const clientTaskIds = new Set(
    tasks.filter((t) => t.clientId === clientId || (t.projectId && clientProjectIds.has(t.projectId))).map((t) => t.id)
  )

  const focusDocs = await loadAllDailyFocusForRange(ctx.db, startDate, endDate)

  // Aggregate time per task (no per-person breakdown)
  const taskTimeMap = {}
  for (const doc of focusDocs) {
    for (const block of (doc.timeBlocks || [])) {
      if (!clientTaskIds.has(block.taskId)) continue
      if (!taskTimeMap[block.taskId]) taskTimeMap[block.taskId] = { totalMinutes: 0, dates: new Set() }
      const minutes = durationMinutes(block.start, block.end)
      taskTimeMap[block.taskId].totalMinutes += minutes
      taskTimeMap[block.taskId].dates.add(doc.date)
    }
  }

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
        status: task?.status || '',
        project: project?.name || '',
        totalMinutes: data.totalMinutes,
        dateCount: data.dates.size,
        rate,
        currency,
      }
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes)

  const totalMinutes = lineItems.reduce((sum, i) => sum + i.totalMinutes, 0)
  const ratedItems = lineItems.filter((i) => i.rate > 0)
  const currencies = [...new Set(ratedItems.map((i) => i.currency))]
  const totalAmount = currencies.length <= 1 ? ratedItems.reduce((sum, i) => sum + (i.totalMinutes / 60) * i.rate, 0) : null
  const currency = currencies.length === 1 ? currencies[0] : client?.currency || 'INR'

  return { clientId, month: monthStr, lineItems, totalMinutes, totalAmount, currency }
}

function renderTable(container, data, ctx) {
  if (!data || data.lineItems.length === 0) {
    container.innerHTML = `
      <div class="ts-empty">
        <i class="ph ph-clipboard-text" style="font-size:32px;opacity:0.3"></i>
        <p>No tracked time found for ${formatMonth(data?.month || '')}.</p>
      </div>
    `
    return
  }

  const client = ctx.clients.find((c) => c.id === data.clientId)
  const hasRates = data.lineItems.some((i) => i.rate > 0)

  container.innerHTML = `
    <div class="ts-sheet">
      <div class="ts-sheet-header">
        <div class="ts-sheet-title">
          ${client?.logoUrl ? `<img class="client-logo" src="${esc(client.logoUrl)}" alt="${esc(client.name)}">` : ''}
          <div>
            <h3>${esc(client?.name || 'Client')}</h3>
            <span class="ts-sheet-period">${formatMonth(data.month)}</span>
          </div>
        </div>
        <div class="ts-sheet-summary">
          <span class="ts-summary-item">${data.lineItems.length} task${data.lineItems.length !== 1 ? 's' : ''}</span>
          <span class="ts-summary-item">${formatDuration(data.totalMinutes)}</span>
          ${hasRates && data.totalAmount != null ? `<span class="ts-summary-total">${formatCurrency(data.totalAmount, data.currency)}</span>` : ''}
        </div>
      </div>
      <table class="ts-table">
        <thead>
          <tr>
            <th class="ts-col-num">#</th>
            <th class="ts-col-task">Task</th>
            <th>Project</th>
            <th>Status</th>
            <th class="ts-col-time">Time</th>
            ${hasRates ? '<th class="ts-col-amount">Amount</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${data.lineItems.map((item, i) => {
            const hours = item.totalMinutes / 60
            const amount = item.rate > 0 ? hours * item.rate : 0
            const statusLabel = item.status.replace('_', ' ')
            return `
              <tr>
                <td class="ts-col-num">${i + 1}</td>
                <td class="ts-col-task">${esc(item.title)}</td>
                <td>${esc(item.project)}</td>
                <td><span class="ts-status ts-status-${item.status}">${esc(statusLabel)}</span></td>
                <td class="ts-col-time">${formatDuration(item.totalMinutes)}</td>
                ${hasRates ? `<td class="ts-col-amount">${item.rate > 0 ? formatCurrency(amount, item.currency) : ''}</td>` : ''}
              </tr>
            `
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="ts-total-row">
            <td colspan="${4}" class="ts-total-label">Total</td>
            <td class="ts-col-time"><strong>${formatDuration(data.totalMinutes)}</strong></td>
            ${hasRates ? `<td class="ts-col-amount"><strong>${data.totalAmount != null ? formatCurrency(data.totalAmount, data.currency) : '\u2014'}</strong></td>` : ''}
          </tr>
        </tfoot>
      </table>
    </div>
  `
}

function durationMinutes(s, e) {
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  let d = (eh * 60 + em) - (sh * 60 + sm)
  if (d < 0) d += 24 * 60
  return Math.max(0, d)
}

function formatDuration(m) {
  if (m <= 0) return '0m'
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r}m`
  if (r === 0) return `${h}h`
  return `${h}h ${r}m`
}

function formatCurrency(amount, currency) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: currency || 'INR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount)
}

function formatMonth(ms) {
  if (!ms) return ''
  const [y, m] = ms.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function esc(str) {
  const el = document.createElement('span')
  el.textContent = str || ''
  return el.innerHTML
}
