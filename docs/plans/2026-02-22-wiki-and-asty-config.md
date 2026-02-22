# Wiki & Asty Config Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Wiki section to PK Work where the team can write and read markdown pages for Processes and Asty's config files, with Asty able to sync config files from Firestore to the VM on a schedule.

**Architecture:** Three-part change: (1) Firestore collections (`processes`, `agentConfig`) with frontend CRUD in a new Wiki view, (2) REST API endpoints for `/processes` and `/agent-config` so Asty can read them via pkwork tools, (3) a new `pkwork_get_agent_config` tool and a cron job that syncs the 5 config files (SOUL.md, TOOLS.md, HEARTBEAT.md, IDENTITY.md, USER.md) from Firestore to `~/clawd/` on the VM.

**Tech Stack:** Vanilla JS + Firebase SDK (frontend), Firestore (data), Firebase Cloud Functions v2 (API), TypeScript (pkwork plugin), systemd cron (config sync)

---

### Task 1: Firestore rules + `processes` and `agentConfig` collections

**Files:**
- Modify: `firestore.rules`

**Step 1: Add rules for the two new collections**

In `firestore.rules`, add after the `notes` block (before closing braces):

```
    // Processes collection (studio SOPs / runbooks)
    match /processes/{processId} {
      allow read: if isTeamMember();
      allow write: if isTeamMember();
    }

    // Asty agent config (workspace files stored in Firestore)
    match /agentConfig/{file} {
      allow read: if isTeamMember();
      allow write: if isTeamMember();
    }
```

**Step 2: Deploy rules**

```bash
firebase deploy --only firestore:rules
# Expected: ✔  firestore: released rules firestore.rules
```

**Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: add processes and agentConfig Firestore rules"
```

---

### Task 2: `db.js` — processes CRUD and agentConfig read/write

**Files:**
- Modify: `src/db.js`

**Step 1: Add processes functions**

After the `loadProjects` block, add:

```js
// ===== Processes =====

export function subscribeToProcesses(db, callback) {
  const q = query(collection(db, 'processes'), orderBy('name'))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  })
}

export async function createProcess(db, data) {
  return addDoc(collection(db, 'processes'), {
    name: data.name,
    content: '',
    contentUpdatedAt: null,
    contentUpdatedBy: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateProcess(db, processId, data) {
  return updateDoc(doc(db, 'processes', processId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteProcess(db, processId) {
  return deleteDoc(doc(db, 'processes', processId))
}

export async function updateProcessContent(db, processId, content, updatedBy) {
  return updateDoc(doc(db, 'processes', processId), {
    content,
    contentUpdatedAt: serverTimestamp(),
    contentUpdatedBy: updatedBy,
    updatedAt: serverTimestamp(),
  })
}

// ===== Agent Config =====

const AGENT_CONFIG_FILES = ['soul', 'tools', 'heartbeat', 'identity', 'user']

export function subscribeToAgentConfig(db, callback) {
  // Subscribe to all 5 config docs at once
  const unsubs = AGENT_CONFIG_FILES.map((file) =>
    onSnapshot(doc(db, 'agentConfig', file), () => {
      // Re-fetch all on any change
      Promise.all(
        AGENT_CONFIG_FILES.map(async (f) => {
          const d = await getDoc(doc(db, 'agentConfig', f))
          return { id: f, ...( d.exists() ? d.data() : { content: '', updatedAt: null, updatedBy: '' }) }
        })
      ).then(callback)
    })
  )
  return () => unsubs.forEach((u) => u())
}

export async function updateAgentConfig(db, file, content, updatedBy) {
  return setDoc(doc(db, 'agentConfig', file), {
    content,
    updatedAt: serverTimestamp(),
    updatedBy,
  }, { merge: true })
}
```

**Step 2: Verify the file imports `setDoc` and `getDoc`**

`setDoc` and `getDoc` are already imported at line 1 of `db.js`. Confirm both are in the destructuring list — they are: `setDoc` (line 6), `getDoc` (line 16). No import changes needed.

**Step 3: Commit**

```bash
git add src/db.js
git commit -m "feat: add processes and agentConfig db functions"
```

---

### Task 3: `functions/index.js` — `/processes` and `/agent-config` API endpoints

**Files:**
- Modify: `functions/index.js`

These endpoints let Asty read processes and config files via the pkwork plugin (which uses the REST API, not the Firebase SDK directly).

**Step 1: Add route handlers in the `exports.api` switch block**

After the `notes` route block (around line 140, before the 404 catch-all), add:

```js
    // --- PROCESSES ---
    if (segments[0] === 'processes') {
      if (req.method === 'GET' && segments.length === 1) {
        return await listProcesses(req, res)
      }
      if (req.method === 'GET' && segments.length === 2) {
        return await getProcess(req, res, segments[1])
      }
    }

    // --- AGENT CONFIG ---
    if (segments[0] === 'agent-config') {
      const VALID_FILES = ['soul', 'tools', 'heartbeat', 'identity', 'user']
      if (segments.length === 2 && VALID_FILES.includes(segments[1])) {
        if (req.method === 'GET') return await getAgentConfig(req, res, segments[1])
        if (req.method === 'PATCH') return await updateAgentConfig(req, res, segments[1])
      }
    }
```

**Step 2: Add the four handler functions**

Add these before the `// === OpenClaw Webhook ===` comment:

```js
// === Processes ===

async function listProcesses(req, res) {
  const snap = await db.collection('processes').orderBy('name').get()
  res.json({ processes: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })
}

async function getProcess(req, res, processId) {
  const doc = await db.collection('processes').doc(processId).get()
  if (!doc.exists) return res.status(404).json({ error: 'Process not found' })
  res.json({ id: doc.id, ...doc.data() })
}

// === Agent Config ===

async function getAgentConfig(req, res, file) {
  const doc = await db.collection('agentConfig').doc(file).get()
  if (!doc.exists) return res.status(404).json({ error: 'Config not found', file })
  res.json({ file, ...doc.data() })
}

async function updateAgentConfig(req, res, file) {
  const { content } = req.body
  if (content === undefined) return res.status(400).json({ error: 'content is required' })
  await db.collection('agentConfig').doc(file).set({
    content,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: req.body.updatedBy || 'api',
  }, { merge: true })
  res.json({ file, updated: true })
}
```

**Step 3: Deploy functions**

```bash
firebase deploy --only functions
# Expected: ✔  functions[api(us-central1)] Successful update operation.
```

**Step 4: Smoke-test**

```bash
API_KEY=$(firebase functions:secrets:access CLAUDE_API_KEY)
curl -s -H "x-api-key: $API_KEY" \
  https://us-central1-workdotpk-a06dc.cloudfunctions.net/api/processes
# Expected: {"processes":[]}

curl -s -H "x-api-key: $API_KEY" \
  https://us-central1-workdotpk-a06dc.cloudfunctions.net/api/agent-config/soul
# Expected: {"error":"Config not found","file":"soul"}  (empty until seeded)
```

**Step 5: Commit**

```bash
git add functions/index.js
git commit -m "feat: add /processes and /agent-config API endpoints"
```

---

### Task 4: `src/wiki.js` — Wiki view (Processes + Asty Config)

**Files:**
- Create: `src/wiki.js`

This is the main new frontend file. Two sections in the left panel (Processes list with add button, Asty Config fixed list). Clicking any item shows a markdown editor on the right — same pattern as `people.js`.

**Step 1: Create `src/wiki.js`**

```js
import { TEAM } from './config.js'
import {
  subscribeToProcesses,
  createProcess,
  updateProcess,
  deleteProcess,
  updateProcessContent,
  subscribeToAgentConfig,
  updateAgentConfig,
} from './db.js'
import { renderMarkdown } from './markdown.js'

const AGENT_CONFIG_FILES = [
  { id: 'soul',      label: 'SOUL.md',      description: 'Personality, tone, how Asty operates' },
  { id: 'tools',     label: 'TOOLS.md',     description: 'Available tools, routines, when to use what' },
  { id: 'heartbeat', label: 'HEARTBEAT.md', description: 'What to do on each periodic check' },
  { id: 'identity',  label: 'IDENTITY.md',  description: 'Name, role, emoji, vibe' },
  { id: 'user',      label: 'USER.md',      description: 'Info about the studio and team' },
]

let unsubProcesses = null
let unsubConfig = null
let localProcesses = []
let localConfig = [] // array of { id, content, updatedAt, updatedBy }
let activeItem = null  // { type: 'process'|'config', id: string }
let isEditing = false
let currentCtx = null

export function renderWiki(container, ctx) {
  if (unsubProcesses) unsubProcesses()
  if (unsubConfig) unsubConfig()
  currentCtx = ctx
  activeItem = null
  isEditing = false

  container.innerHTML = `
    <div class="wiki-view">
      <div class="wiki-header">
        <h2>Wiki</h2>
        <p>Processes, runbooks, and Asty's configuration</p>
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

          <div class="wiki-section">
            <div class="section-title-row">
              <h3 class="section-title">Asty Config</h3>
            </div>
            <div id="wiki-config-list"></div>
          </div>

        </div>
        <div class="wiki-detail-panel hidden" id="wiki-detail-panel">
          <div id="wiki-detail-content"></div>
        </div>
      </div>
    </div>
  `

  // Add process form
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
    // Open the new process for editing
    const newProcess = { id: ref.id, name, content: '' }
    openDetail({ type: 'process', id: ref.id })
  })

  document.getElementById('new-process-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('save-process-btn').click()
    if (e.key === 'Escape') document.getElementById('cancel-process-btn').click()
  })

  // Subscribe to processes
  unsubProcesses = subscribeToProcesses(ctx.db, (processes) => {
    localProcesses = processes
    renderProcessList()
    if (activeItem?.type === 'process') {
      const p = localProcesses.find((x) => x.id === activeItem.id)
      if (p) renderDetail()
    }
  })

  // Subscribe to agent config
  unsubConfig = subscribeToAgentConfig(ctx.db, (configs) => {
    localConfig = configs
    renderConfigList()
    if (activeItem?.type === 'config') renderDetail()
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
    <div class="wiki-row${activeItem?.id === p.id ? ' active' : ''}" data-type="process" data-id="${p.id}">
      <i class="ph ph-flow-arrow wiki-row-icon"></i>
      <span class="wiki-row-name">${esc(p.name)}</span>
    </div>
  `).join('')

  list.querySelectorAll('.wiki-row').forEach((row) => {
    row.addEventListener('click', () => openDetail({ type: 'process', id: row.dataset.id }))
  })
}

function renderConfigList() {
  const list = document.getElementById('wiki-config-list')
  if (!list) return

  list.innerHTML = AGENT_CONFIG_FILES.map((f) => `
    <div class="wiki-row${activeItem?.id === f.id && activeItem?.type === 'config' ? ' active' : ''}" data-type="config" data-id="${f.id}">
      <i class="ph ph-file-md wiki-row-icon"></i>
      <div class="wiki-row-info">
        <span class="wiki-row-name">${esc(f.label)}</span>
        <span class="wiki-row-meta">${esc(f.description)}</span>
      </div>
    </div>
  `).join('')

  list.querySelectorAll('.wiki-row').forEach((row) => {
    row.addEventListener('click', () => openDetail({ type: 'config', id: row.dataset.id }))
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

  if (activeItem.type === 'process') {
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
      onRename: async (name) => {
        if (name && name !== process.name) {
          await updateProcess(currentCtx.db, process.id, { name })
        }
      },
    })
  } else {
    const meta = AGENT_CONFIG_FILES.find((f) => f.id === activeItem.id)
    const configDoc = localConfig.find((c) => c.id === activeItem.id)
    if (!meta) return
    renderItemDetail(container, {
      title: meta.label,
      subtitle: meta.description,
      content: configDoc?.content || '',
      updatedBy: configDoc?.updatedBy || '',
      updatedAt: configDoc?.updatedAt,
      canDelete: false,
      isAstyConfig: true,
      onSave: async (content) => {
        await updateAgentConfig(currentCtx.db, activeItem.id, content, currentCtx.currentUser?.email || '')
        isEditing = false
      },
    })
  }
}

function renderItemDetail(container, { title, subtitle, content, updatedBy, updatedAt, canDelete, isAstyConfig, onSave, onDelete, onRename }) {
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
        ${isAstyConfig ? '<div class="wiki-asty-badge"><i class="ph ph-robot"></i> Asty syncs this file to the VM every 2 hours</div>' : ''}
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
  if (unsubConfig) { unsubConfig(); unsubConfig = null }
  localProcesses = []
  localConfig = []
  currentCtx = null
  activeItem = null
  isEditing = false
}
```

**Step 2: Verify it imports correctly**

No external deps beyond what's already in the project. `renderMarkdown` comes from `./markdown.js` (used by people.js and clients.js already).

**Step 3: Commit**

```bash
git add src/wiki.js
git commit -m "feat: add wiki.js with Processes and Asty Config views"
```

---

### Task 5: `index.html` + `main.js` — wire Wiki nav tab

**Files:**
- Modify: `index.html`
- Modify: `src/main.js`

**Step 1: Add Wiki nav tab to `index.html`**

In the `<nav class="header-nav">` block, after the People tab (line 45), add:

```html
            <button class="nav-tab" data-view="wiki"><i class="ph-fill ph-book-open"></i> <span class="nav-label">Wiki</span></button>
```

**Step 2: Add import to `main.js`**

After the `import { renderPeople, cleanupPeople }` line:

```js
import { renderWiki, cleanupWiki } from './wiki.js'
```

**Step 3: Add cleanup call in `renderCurrentView`**

In the "Clean up subscriptions when leaving views" block (around line 474):

```js
  if (currentView !== 'wiki') cleanupWiki()
```

**Step 4: Add wiki case to the switch**

After the `people` case:

```js
    case 'wiki':
      renderWiki(mainContent, ctx)
      break
```

**Step 5: Verify in browser**

```bash
npm run dev
# Navigate to http://localhost:3000
# Expected: Wiki tab appears in nav, clicking shows two-panel layout
# — left panel: "Processes" section with + button, "Asty Config" section with 5 files
# — clicking any item opens right panel with markdown editor
```

**Step 6: Commit**

```bash
git add index.html src/main.js
git commit -m "feat: add Wiki nav tab and wire renderWiki"
```

---

### Task 6: Seed `agentConfig` in Firestore with current VM file contents

**Step 1: SSH into the VM and print all 5 files**

```bash
ssh -i ~/.ssh/id_ed25519_oracle ubuntu@141.148.223.101 \
  "for f in soul tools heartbeat identity user; do
    name=\$(echo \$f | tr '[:lower:]' '[:upper:]')
    echo \"=== \$f ===\"
    cat ~/clawd/\${name}.md 2>/dev/null || echo '(empty)'
    echo
  done"
```

**Step 2: For each file, seed via the API**

Get the API key:
```bash
API_KEY=$(firebase functions:secrets:access CLAUDE_API_KEY)
```

Then for each file (soul, tools, heartbeat, identity, user), POST its content:
```bash
curl -s -X PATCH \
  https://us-central1-workdotpk-a06dc.cloudfunctions.net/api/agent-config/soul \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d "{\"content\": \"<SOUL.md content here>\", \"updatedBy\": \"gyan@publicknowledge.co\"}"
```

Repeat for tools, heartbeat, identity, user.

**Step 3: Verify in PK Work**

Open PK Work → Wiki → Asty Config → click SOUL.md. Should show the content.

---

### Task 7: pkwork plugin — `pkwork_get_agent_config` tool

**Files:**
- Create: `~/.openclaw/extensions/openclaw-pkwork/tools/get-agent-config.ts` (on Oracle VM)
- Modify: `~/.openclaw/extensions/openclaw-pkwork/index.ts` (on Oracle VM)

**Step 1: Create the tool file**

SSH into the VM and create `~/.openclaw/extensions/openclaw-pkwork/tools/get-agent-config.ts`:

```ts
import { Type } from "@sinclair/typebox"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import type { PkworkClient } from "../client.ts"
import { writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

const FILE_MAP: Record<string, string> = {
  soul: 'SOUL.md',
  tools: 'TOOLS.md',
  heartbeat: 'HEARTBEAT.md',
  identity: 'IDENTITY.md',
  user: 'USER.md',
}

export function registerGetAgentConfigTool(
  api: OpenClawPluginApi,
  client: PkworkClient,
): void {
  api.registerTool(
    {
      name: "pkwork_get_agent_config",
      label: "PK Work: Get Agent Config",
      description:
        "Read one of Asty's workspace config files from PK Work (Firestore). " +
        "Files: soul, tools, heartbeat, identity, user. " +
        "Optionally write it to ~/clawd/ to sync the local file.",
      parameters: Type.Object({
        file: Type.String({
          description: "Which config file: soul, tools, heartbeat, identity, or user",
        }),
        writeLocal: Type.Optional(Type.Boolean({
          description: "If true, write the content to ~/clawd/<FILE>.md on disk",
        })),
      }),
      async execute(
        _toolCallId: string,
        params: { file: string; writeLocal?: boolean },
      ) {
        const filename = FILE_MAP[params.file]
        if (!filename) {
          return {
            content: [{
              type: "text" as const,
              text: `Unknown config file: ${params.file}. Valid: ${Object.keys(FILE_MAP).join(', ')}`,
            }],
          }
        }

        const result = (await client.getAgentConfig(params.file)) as {
          content?: string
          updatedAt?: { _seconds: number } | null
          updatedBy?: string
        }

        if (!result.content) {
          return {
            content: [{ type: "text" as const, text: `No content found for ${params.file}.` }],
          }
        }

        if (params.writeLocal) {
          const filePath = join(homedir(), 'clawd', filename)
          await writeFile(filePath, result.content, 'utf8')
        }

        const updatedByStr = result.updatedBy
          ? ` (last updated by ${result.updatedBy})`
          : ''

        return {
          content: [{
            type: "text" as const,
            text: `${result.content}\n\n---\n${filename}${updatedByStr}${params.writeLocal ? ` — written to ~/clawd/${filename}` : ''}`,
          }],
        }
      },
    },
    { name: "pkwork_get_agent_config" },
  )
}
```

**Step 2: Add `getAgentConfig` to `PkworkClient`**

In `~/.openclaw/extensions/openclaw-pkwork/client.ts`, find the `getPageContent` method and add after it:

```ts
  async getAgentConfig(file: string) {
    return this.request(`/agent-config/${file}`)
  }
```

**Step 3: Register the tool in `index.ts`**

Add the import:
```ts
import { registerGetAgentConfigTool } from "./tools/get-agent-config.ts"
```

Add the registration in the `register` function after the existing tool registrations:
```ts
registerGetAgentConfigTool(api, client)
```

**Step 4: Restart OpenClaw to pick up the new tool**

```bash
sudo systemctl restart openclaw
sudo systemctl status openclaw
# Expected: active (running)
```

**Step 5: Commit**

The pkwork plugin files live on the VM only (not in the git repo). No commit needed, but note this in the FAQ file later.

---

### Task 8: Add config-sync cron job

**Files:**
- Modify: `~/.openclaw/cron/jobs.json` (on Oracle VM)

**Step 1: Read current cron jobs**

```bash
ssh -i ~/.ssh/id_ed25519_oracle ubuntu@141.148.223.101 "cat ~/.openclaw/cron/jobs.json"
```

**Step 2: Add `config-sync` job**

Add a new job entry that runs every 2 hours on weekdays. The job instructs Asty to sync all 5 config files from Firestore to `~/clawd/`:

```json
{
  "id": "config-sync",
  "schedule": "0 */2 * * 1-5",
  "announce": {
    "channel": "slack",
    "to": "U08TAJW39NK",
    "message": "Sync all agent config files from PK Work to ~/clawd/. For each file (soul, tools, heartbeat, identity, user), call pkwork_get_agent_config with writeLocal: true. Do all 5. Confirm when done."
  }
}
```

**Step 3: Hot-reload cron config**

OpenClaw hot-reloads JSON config changes. Touch the file or send SIGUSR1 to trigger reload:
```bash
ssh -i ~/.ssh/id_ed25519_oracle ubuntu@141.148.223.101 \
  "sudo kill -USR1 \$(systemctl show -p MainPID --value openclaw)"
```

**Step 4: Verify cron loaded**

```bash
ssh -i ~/.ssh/id_ed25519_oracle ubuntu@141.148.223.101 \
  "grep 'config-sync' ~/.openclaw/logs/gateway.log | tail -5"
```

---

### Task 9: CSS — add wiki styles to `src/style.css`

**Files:**
- Modify: `src/style.css`

**Step 1: Find where people/clients styles end**

```bash
grep -n 'people-view\|clients-view' src/style.css | tail -5
```

**Step 2: Add wiki styles at the end of the file**

```css
/* === Wiki === */

.wiki-view { display: flex; flex-direction: column; height: 100%; }
.wiki-header { padding: 20px 24px 16px; border-bottom: 1px solid var(--border); }
.wiki-header h2 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
.wiki-header p { margin: 0; font-size: 13px; color: var(--text-muted); }

.wiki-layout { display: flex; flex: 1; overflow: hidden; }

.wiki-list-panel {
  width: 260px;
  min-width: 260px;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 12px 0;
}

.wiki-section { margin-bottom: 8px; }
.wiki-section .section-title-row { padding: 4px 16px 6px; }

.wiki-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 0;
  transition: background 0.1s;
}
.wiki-row:hover { background: var(--bg-hover); }
.wiki-row.active { background: var(--bg-selected); }

.wiki-row-icon { font-size: 16px; color: var(--text-muted); flex-shrink: 0; }
.wiki-row-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.wiki-row-name { font-size: 13px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wiki-row-meta { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.wiki-detail-panel {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.wiki-detail { max-width: 720px; }

.wiki-detail-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 20px;
}
.wiki-detail-title-group { flex: 1; }
.wiki-detail-title { margin: 0; font-size: 20px; font-weight: 600; }
.wiki-detail-subtitle { margin: 4px 0 0; font-size: 13px; color: var(--text-muted); }
.wiki-detail-actions { display: flex; gap: 4px; }

.wiki-asty-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg-hover);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  margin-bottom: 16px;
}

@media (max-width: 700px) {
  .wiki-layout { flex-direction: column; }
  .wiki-list-panel { width: 100%; min-width: 0; border-right: none; border-bottom: 1px solid var(--border); }
  .wiki-list-panel.detail-open { display: none; }
  .wiki-detail-panel { padding: 16px; }
}
```

**Step 3: Verify styles work in browser**

```bash
npm run dev
# Wiki tab should have correct layout, two sections in left panel, detail on right
```

**Step 4: Commit**

```bash
git add src/style.css
git commit -m "feat: add wiki CSS styles"
```

---

### Task 10: Deploy frontend

**Step 1: Build and deploy hosting**

```bash
npm run deploy
# Expected: ✔  Deploy complete!
```

**Step 2: End-to-end test on work.publicknowledge.co**

1. Open Wiki tab — see "Processes" and "Asty Config" sections
2. Create a new Process — type name, click Add — opens detail panel
3. Click "Start writing" — type some markdown — Save — see rendered output
4. Click SOUL.md in Asty Config — see the seeded content rendered
5. Click Edit — make a small change — Save — content updates

---

## Post-Implementation Checklist

- [ ] `processes` and `agentConfig` Firestore security rules deployed
- [ ] `/processes` and `/agent-config` API endpoints live
- [ ] Wiki tab visible in PK Work nav
- [ ] Can create/edit/delete processes
- [ ] All 5 Asty config files show correct seeded content
- [ ] Can edit config files in the UI
- [ ] `pkwork_get_agent_config` tool registered and working
- [ ] `config-sync` cron job active (runs every 2h on weekdays)
- [ ] Config sync tested manually (tell Asty in Slack: "sync your config from PK Work")
