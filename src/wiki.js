import { TEAM } from './config.js'
import {
  subscribeToProcesses,
  createProcess,
  updateProcess,
  deleteProcess,
  updateProcessContent,
} from './db.js'
import { renderMarkdown } from './markdown.js'

let unsubProcesses = null
let localProcesses = []
let activeItem = null  // { type: 'process', id: string }
let isEditing = false
let currentCtx = null

export function renderWiki(container, ctx) {
  if (unsubProcesses) unsubProcesses()
  currentCtx = ctx
  activeItem = null
  isEditing = false

  container.innerHTML = `
    <div class="wiki-view">
      <div class="wiki-header">
        <h2>Wiki</h2>
        <p>Processes and runbooks</p>
      </div>
      <div class="wiki-layout">
        <div class="wiki-list-panel" id="wiki-list-panel">

          <div class="wiki-section">
            <div class="section-title-row">
              <h3 class="section-title">Processes</h3>
              <button class="btn-primary" id="add-process-btn"><i class="ph ph-plus"></i> Process</button>
            </div>
            <div id="add-process-form" class="inline-form hidden">
              <input type="text" id="new-process-name" class="form-input" placeholder="Process name">
              <div class="inline-form-actions">
                <button class="btn-primary" id="save-process-btn">Add</button>
                <button class="btn-ghost" id="cancel-process-btn">Cancel</button>
              </div>
            </div>
            <div id="wiki-processes-list"></div>
          </div>

        </div>
        <div class="wiki-detail-panel hidden" id="wiki-detail-panel">
          <div id="wiki-detail-content"></div>
        </div>
      </div>
    </div>
  `

  document.getElementById('add-process-btn').addEventListener('click', () => {
    document.getElementById('add-process-form').classList.remove('hidden')
    document.getElementById('new-process-name').focus()
  })

  document.getElementById('cancel-process-btn').addEventListener('click', () => {
    document.getElementById('add-process-form').classList.add('hidden')
    document.getElementById('new-process-name').value = ''
  })

  document.getElementById('save-process-btn').addEventListener('click', async () => {
    const name = document.getElementById('new-process-name').value.trim()
    if (!name) { document.getElementById('new-process-name').focus(); return }
    const ref = await createProcess(ctx.db, { name })
    document.getElementById('add-process-form').classList.add('hidden')
    document.getElementById('new-process-name').value = ''
    openDetail({ type: 'process', id: ref.id })
  })

  document.getElementById('new-process-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('save-process-btn').click()
    if (e.key === 'Escape') document.getElementById('cancel-process-btn').click()
  })

  unsubProcesses = subscribeToProcesses(ctx.db, (processes) => {
    localProcesses = processes
    renderProcessList()
    if (activeItem?.type === 'process') {
      const p = localProcesses.find((x) => x.id === activeItem.id)
      if (p) renderDetail()
    }
  })
}

function renderProcessList() {
  const list = document.getElementById('wiki-processes-list')
  if (!list) return

  if (localProcesses.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-text">No processes yet</div></div>'
    return
  }

  list.innerHTML = localProcesses.map((p) => `
    <div class="wiki-row${activeItem?.id === p.id && activeItem?.type === 'process' ? ' active' : ''}" data-type="process" data-id="${p.id}">
      <i class="ph ph-flow-arrow wiki-row-icon"></i>
      <span class="wiki-row-name">${esc(p.name)}</span>
    </div>
  `).join('')

  list.querySelectorAll('.wiki-row').forEach((row) => {
    row.addEventListener('click', () => openDetail({ type: 'process', id: row.dataset.id }))
  })
}

function openDetail(item) {
  activeItem = item
  isEditing = false

  document.querySelectorAll('.wiki-row').forEach((r) => {
    r.classList.toggle('active', r.dataset.type === item.type && r.dataset.id === item.id)
  })

  document.getElementById('wiki-detail-panel').classList.remove('hidden')
  document.getElementById('wiki-list-panel').classList.add('detail-open')
  renderDetail()
}

function closeDetail() {
  activeItem = null
  isEditing = false
  document.getElementById('wiki-detail-panel').classList.add('hidden')
  document.getElementById('wiki-list-panel').classList.remove('detail-open')
  document.querySelectorAll('.wiki-row').forEach((r) => r.classList.remove('active'))
}

function renderDetail() {
  const container = document.getElementById('wiki-detail-content')
  if (!container || !activeItem) return

  const process = localProcesses.find((p) => p.id === activeItem.id)
  if (!process) return
  renderItemDetail(container, {
    title: process.name,
    content: process.content || '',
    updatedBy: process.contentUpdatedBy || '',
    updatedAt: process.contentUpdatedAt,
    canDelete: true,
    onSave: async (content) => {
      await updateProcessContent(currentCtx.db, process.id, content, currentCtx.currentUser?.email || '')
      isEditing = false
    },
    onDelete: async () => {
      if (confirm(`Delete "${process.name}"? This cannot be undone.`)) {
        await deleteProcess(currentCtx.db, process.id)
        closeDetail()
      }
    },
  })
}

function renderItemDetail(container, { title, subtitle, content, updatedBy, updatedAt, canDelete, onSave, onDelete }) {
  const updatedByMember = updatedBy ? TEAM.find((m) => m.email === updatedBy) : null
  const updatedByName = updatedByMember?.name || updatedBy || ''
  const dateStr = updatedAt ? formatDate(updatedAt) : ''
  const metaLine = updatedByName
    ? `<div class="page-meta">Last edited by ${esc(updatedByName)}${dateStr ? ' · ' + dateStr : ''}</div>`
    : ''

  if (isEditing) {
    container.innerHTML = `
      <div class="wiki-detail">
        <div class="wiki-detail-header">
          <button class="btn-ghost" id="wiki-back-btn"><i class="ph ph-arrow-left"></i></button>
          <h2 class="wiki-detail-title">${esc(title)}</h2>
        </div>
        <div class="page-editor">
          <textarea id="wiki-editor-textarea" class="page-editor-textarea" placeholder="Write using markdown...">${esc(content)}</textarea>
          <div class="page-editor-actions">
            <button class="btn-primary" id="wiki-save-btn">Save</button>
            <button class="btn-ghost" id="wiki-cancel-btn">Cancel</button>
          </div>
        </div>
      </div>
    `
    const textarea = document.getElementById('wiki-editor-textarea')
    textarea.focus()
    textarea.style.height = Math.max(300, textarea.scrollHeight) + 'px'
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto'
      textarea.style.height = Math.max(300, textarea.scrollHeight) + 'px'
    })

    document.getElementById('wiki-back-btn').addEventListener('click', closeDetail)
    document.getElementById('wiki-cancel-btn').addEventListener('click', () => { isEditing = false; renderDetail() })
    document.getElementById('wiki-save-btn').addEventListener('click', async () => {
      await onSave(textarea.value)
      renderDetail()
    })
  } else {
    container.innerHTML = `
      <div class="wiki-detail">
        <div class="wiki-detail-header">
          <button class="btn-ghost" id="wiki-back-btn"><i class="ph ph-arrow-left"></i></button>
          <div class="wiki-detail-title-group">
            <h2 class="wiki-detail-title">${esc(title)}</h2>
            ${subtitle ? `<p class="wiki-detail-subtitle">${esc(subtitle)}</p>` : ''}
          </div>
          <div class="wiki-detail-actions">
            ${canDelete ? `<button class="btn-ghost" id="wiki-delete-btn" title="Delete"><i class="ph ph-trash"></i></button>` : ''}
          </div>
        </div>
        ${content ? `
          <div class="page-display">
            ${metaLine}
            <div class="page-content">${renderMarkdown(content)}</div>
            <button class="btn-ghost page-edit-btn" id="wiki-edit-btn"><i class="ph ph-pencil-simple"></i> Edit</button>
          </div>
        ` : `
          <div class="page-empty">
            <p>No content yet.</p>
            <button class="btn-primary" id="wiki-edit-btn"><i class="ph ph-pencil-simple"></i> Start writing</button>
          </div>
        `}
      </div>
    `

    document.getElementById('wiki-back-btn').addEventListener('click', closeDetail)
    document.getElementById('wiki-edit-btn')?.addEventListener('click', () => { isEditing = true; renderDetail() })
    document.getElementById('wiki-delete-btn')?.addEventListener('click', onDelete)
  }
}

function formatDate(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
}

function esc(str) {
  const el = document.createElement('span')
  el.textContent = str || ''
  return el.innerHTML
}

export function cleanupWiki() {
  if (unsubProcesses) { unsubProcesses(); unsubProcesses = null }
  localProcesses = []
  currentCtx = null
  activeItem = null
  isEditing = false
}
