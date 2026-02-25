# References Library Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a visual reference library in PK Work that auto-ingests from Slack #references, shows OG image previews, supports AI auto-tagging, and includes mood boards.

**Architecture:** New `references` and `moodboards` Firestore collections with full CRUD API endpoints on the existing Cloud Function, a new `references.js` frontend view with card grid and filters, and an OG metadata preview endpoint for link unfurling.

**Tech Stack:** Firebase/Firestore, Cloud Functions (Node.js), Vite + vanilla JS frontend, Phosphor Icons

---

### Task 1: Firestore Security Rules — Add references & moodboards

**Files:**
- Modify: `firestore.rules`

**Step 1: Add rules for both new collections**

Add after the `notes` collection rules (after line 60):

```
    // References collection (design references from Slack)
    match /references/{referenceId} {
      allow read: if isTeamMember();
      allow write: if isTeamMember();
    }

    // Moodboards collection (curated reference groups)
    match /moodboards/{moodboardId} {
      allow read: if isTeamMember();
      allow write: if isTeamMember();
    }
```

**Step 2: Commit**

```bash
git add firestore.rules
git commit -m "feat: add Firestore security rules for references and moodboards"
```

---

### Task 2: Firestore Indexes — Add composite indexes for references

**Files:**
- Modify: `firestore.indexes.json`

**Step 1: Add 4 composite indexes for the references collection**

Add these to the `indexes` array in `firestore.indexes.json`:

```json
{
  "collectionGroup": "references",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "clientId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "references",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "projectId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "references",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "tags", "arrayConfig": "CONTAINS" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "references",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "sharedBy", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

**Step 2: Commit**

```bash
git add firestore.indexes.json
git commit -m "feat: add composite Firestore indexes for references collection"
```

---

### Task 3: Backend API — References CRUD endpoints

**Files:**
- Modify: `functions/index.js`

**Step 1: Add references route handling in the main `api` export**

In the `try` block of `exports.api` (after the notes section, around line 137), add:

```javascript
    // --- REFERENCES ---
    if (segments[0] === 'references') {
      if (segments.length === 2 && segments[1] === 'preview' && req.method === 'GET') {
        return await previewReference(req, res)
      }
      if (segments.length === 2 && segments[1] === 'search' && req.method === 'GET') {
        return await searchReferences(req, res)
      }
      if (req.method === 'GET' && segments.length === 1) {
        return await listReferences(req, res)
      }
      if (req.method === 'POST' && segments.length === 1) {
        return await createReference(req, res)
      }
      if (req.method === 'PATCH' && segments.length === 2) {
        return await updateReference(req, res, segments[1])
      }
      if (req.method === 'DELETE' && segments.length === 2) {
        return await deleteReference(req, res, segments[1])
      }
    }

    // --- MOODBOARDS ---
    if (segments[0] === 'moodboards') {
      if (req.method === 'GET' && segments.length === 1) {
        return await listMoodboards(req, res)
      }
      if (req.method === 'POST' && segments.length === 1) {
        return await createMoodboard(req, res)
      }
      if (req.method === 'PATCH' && segments.length === 2) {
        return await updateMoodboard(req, res, segments[1])
      }
      if (req.method === 'DELETE' && segments.length === 2) {
        return await deleteMoodboard(req, res, segments[1])
      }
    }
```

**Step 2: Add reference handler functions**

Add at end of `functions/index.js`:

```javascript
// === References Handlers ===

async function listReferences(req, res) {
  let q = db.collection('references')

  if (req.query.clientId) q = q.where('clientId', '==', req.query.clientId)
  if (req.query.projectId) q = q.where('projectId', '==', req.query.projectId)
  if (req.query.tag) q = q.where('tags', 'array-contains', req.query.tag)
  if (req.query.sharedBy) q = q.where('sharedBy', '==', req.query.sharedBy)

  q = q.orderBy('createdAt', 'desc')

  const limit = parseInt(req.query.limit) || 50
  const offset = parseInt(req.query.offset) || 0
  q = q.limit(limit + offset)

  const snap = await q.get()
  const refs = snap.docs.slice(offset).map((d) => ({ id: d.id, ...d.data() }))
  res.json({ references: refs })
}

async function createReference(req, res) {
  const data = req.body
  if (!data.url) return res.status(400).json({ error: 'url is required' })

  const reference = {
    url: data.url,
    title: data.title || '',
    description: data.description || '',
    imageUrl: data.imageUrl || '',
    tags: data.tags || [],
    clientId: data.clientId || '',
    projectId: data.projectId || '',
    sharedBy: data.sharedBy || '',
    slackMessageTs: data.slackMessageTs || '',
    slackChannel: data.slackChannel || '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }

  const ref = await db.collection('references').add(reference)
  res.status(201).json({ id: ref.id, ...reference })
}

async function updateReference(req, res, refId) {
  const data = req.body
  const update = { ...data }
  await db.collection('references').doc(refId).update(update)
  res.json({ id: refId, updated: true })
}

async function deleteReference(req, res, refId) {
  await db.collection('references').doc(refId).delete()
  res.json({ id: refId, deleted: true })
}

async function searchReferences(req, res) {
  const query = (req.query.q || '').toLowerCase()
  if (!query) return res.status(400).json({ error: 'q parameter is required' })

  // Firestore doesn't support full-text search natively,
  // so we fetch recent references and filter in memory.
  // For a production system, consider Algolia or Typesense.
  const snap = await db.collection('references')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get()

  const results = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) =>
      (r.title || '').toLowerCase().includes(query) ||
      (r.description || '').toLowerCase().includes(query) ||
      (r.url || '').toLowerCase().includes(query) ||
      (r.tags || []).some((t) => t.toLowerCase().includes(query))
    )

  res.json({ references: results })
}

async function previewReference(req, res) {
  const url = req.query.url
  if (!url) return res.status(400).json({ error: 'url parameter is required' })

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'PKWorkBot/1.0 (reference-preview)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    const html = await response.text()

    // Extract OG metadata
    const getMetaContent = (property) => {
      const patterns = [
        new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
        new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'),
        new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
        new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${property}["']`, 'i'),
      ]
      for (const pattern of patterns) {
        const match = html.match(pattern)
        if (match) return match[1]
      }
      return ''
    }

    const title = getMetaContent('og:title') ||
      getMetaContent('twitter:title') ||
      (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || ''

    const description = getMetaContent('og:description') ||
      getMetaContent('twitter:description') ||
      getMetaContent('description') || ''

    const imageUrl = getMetaContent('og:image') ||
      getMetaContent('twitter:image') ||
      getMetaContent('twitter:image:src') || ''

    res.json({ title: title.trim(), description: description.trim(), imageUrl })
  } catch (err) {
    console.error('Preview fetch error:', err.message)
    res.json({ title: '', description: '', imageUrl: '', error: 'Could not fetch preview' })
  }
}

// === Moodboard Handlers ===

async function listMoodboards(req, res) {
  let q = db.collection('moodboards')
  if (req.query.clientId) q = q.where('clientId', '==', req.query.clientId)
  if (req.query.projectId) q = q.where('projectId', '==', req.query.projectId)
  q = q.orderBy('updatedAt', 'desc')

  const snap = await q.get()
  const boards = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  res.json({ moodboards: boards })
}

async function createMoodboard(req, res) {
  const data = req.body
  if (!data.name) return res.status(400).json({ error: 'name is required' })

  const board = {
    name: data.name,
    description: data.description || '',
    referenceIds: data.referenceIds || [],
    clientId: data.clientId || '',
    projectId: data.projectId || '',
    createdBy: data.createdBy || '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }

  const ref = await db.collection('moodboards').add(board)
  res.status(201).json({ id: ref.id, ...board })
}

async function updateMoodboard(req, res, boardId) {
  const data = req.body
  const update = { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() }
  await db.collection('moodboards').doc(boardId).update(update)
  res.json({ id: boardId, updated: true })
}

async function deleteMoodboard(req, res, boardId) {
  await db.collection('moodboards').doc(boardId).delete()
  res.json({ id: boardId, deleted: true })
}
```

**Step 3: Commit**

```bash
git add functions/index.js
git commit -m "feat: add API endpoints for references CRUD, search, preview, and moodboards"
```

---

### Task 4: Frontend DB layer — Add Firestore functions for references & moodboards

**Files:**
- Modify: `src/db.js`

**Step 1: Add references and moodboards functions**

Append to the end of `src/db.js`:

```javascript
// ===== References =====

export function subscribeToReferences(db, callback) {
  const q = query(collection(db, 'references'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  })
}

export async function loadReferences(db, filters = {}) {
  let q = collection(db, 'references')
  const constraints = []

  if (filters.clientId) constraints.push(where('clientId', '==', filters.clientId))
  if (filters.projectId) constraints.push(where('projectId', '==', filters.projectId))
  if (filters.tag) constraints.push(where('tags', 'array-contains', filters.tag))
  if (filters.sharedBy) constraints.push(where('sharedBy', '==', filters.sharedBy))

  constraints.push(orderBy('createdAt', 'desc'))

  const snap = await getDocs(query(q, ...constraints))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function createReference(db, data) {
  return addDoc(collection(db, 'references'), {
    url: data.url,
    title: data.title || '',
    description: data.description || '',
    imageUrl: data.imageUrl || '',
    tags: data.tags || [],
    clientId: data.clientId || '',
    projectId: data.projectId || '',
    sharedBy: data.sharedBy || '',
    slackMessageTs: data.slackMessageTs || '',
    slackChannel: data.slackChannel || '',
    createdAt: serverTimestamp(),
  })
}

export async function updateReference(db, refId, data) {
  return updateDoc(doc(db, 'references', refId), data)
}

export async function deleteReference(db, refId) {
  return deleteDoc(doc(db, 'references', refId))
}

// ===== Moodboards =====

export function subscribeToMoodboards(db, callback) {
  const q = query(collection(db, 'moodboards'), orderBy('updatedAt', 'desc'))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  })
}

export async function createMoodboard(db, data) {
  return addDoc(collection(db, 'moodboards'), {
    name: data.name,
    description: data.description || '',
    referenceIds: data.referenceIds || [],
    clientId: data.clientId || '',
    projectId: data.projectId || '',
    createdBy: data.createdBy || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateMoodboard(db, boardId, data) {
  return updateDoc(doc(db, 'moodboards', boardId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteMoodboard(db, boardId) {
  return deleteDoc(doc(db, 'moodboards', boardId))
}
```

**Step 2: Commit**

```bash
git add src/db.js
git commit -m "feat: add Firestore CRUD functions for references and moodboards"
```

---

### Task 5: Frontend — References view (grid + filters + search)

**Files:**
- Create: `src/references.js`

**Step 1: Create the references view module**

Create `src/references.js` with the following structure. This is the main view that renders:
- A sub-nav to toggle between "All References" and "Mood Boards"
- Search input
- Filter row: client, project, tag, shared by
- Responsive card grid with OG image thumbnails
- Reference detail modal on card click

The view subscribes to the `references` collection in real-time using `subscribeToReferences` from `db.js`.

Key implementation details:
- **Card grid:** Each card shows: `imageUrl` as background/thumbnail (with fallback to domain favicon), `title`, source domain extracted from URL, up to 3 tag pills, `sharedBy` name, relative date
- **Search:** Client-side filter across title, description, url, and tags
- **Filters:** Dropdown selects pre-populated from clients, projects, and unique tags extracted from loaded references
- **Detail view:** Clicking a card opens a panel/modal showing full info with edit capability for tags and client/project linking
- **Empty state:** Message + illustration when no references exist yet

Card HTML pattern (each card):
```html
<a class="ref-card" href="{url}" target="_blank" data-id="{id}">
  <div class="ref-card-image" style="background-image: url({imageUrl})">
    <span class="ref-card-domain">{domain}</span>
  </div>
  <div class="ref-card-body">
    <h3 class="ref-card-title">{title}</h3>
    <p class="ref-card-desc">{description}</p>
    <div class="ref-card-tags">{tag pills}</div>
    <div class="ref-card-meta">
      <span class="ref-card-author">{sharedBy}</span>
      <span class="ref-card-date">{relative date}</span>
    </div>
  </div>
</a>
```

**Step 2: Commit**

```bash
git add src/references.js
git commit -m "feat: add references view with card grid, search, and filters"
```

---

### Task 6: Frontend — Mood boards sub-view

The mood boards view is part of `src/references.js` (toggled via sub-nav).

**Implementation in `src/references.js`:**
- "Mood Boards" tab shows a grid of mood board cards
- Each mood board card shows: name, description, count of references, first 3-4 reference thumbnails as a mini-collage
- Clicking a mood board filters the references grid to show only that board's references
- "New Mood Board" button opens a simple form (name, description, client, project)
- Editing a mood board lets you add/remove references by toggling selection

This is implemented within Task 5's file. No separate file needed.

---

### Task 7: Frontend — Wire up navigation & routing

**Files:**
- Modify: `index.html` (add nav tab)
- Modify: `src/main.js` (add routing, import, subscription)

**Step 1: Add References nav tab to `index.html`**

In `index.html`, add after the People nav tab (line 45):

```html
<button class="nav-tab" data-view="references"><i class="ph-fill ph-image-square"></i> <span class="nav-label">References</span></button>
```

**Step 2: Update `src/main.js`**

Add import at top:
```javascript
import { renderReferences, cleanupReferences } from './references.js'
```

In `renderCurrentView()`, add cleanup call:
```javascript
if (currentView !== 'references') cleanupReferences()
```

Add case in the switch:
```javascript
case 'references':
  renderReferences(mainContent, ctx)
  break
```

Hide filters/new-task button for references view: update the `isTaskView` check — references is NOT a task view, so no changes needed there (filters already hidden for non-task views).

**Step 3: Commit**

```bash
git add index.html src/main.js
git commit -m "feat: wire up References nav tab and routing in main app"
```

---

### Task 8: Frontend — CSS styles for references

**Files:**
- Modify: `src/style.css`

**Step 1: Add CSS for reference cards, grid, filters, detail modal, mood boards**

Key styles to add:
- `.references-container` — full-width container with padding
- `.references-toolbar` — search + filters row (flex, gap)
- `.references-grid` — CSS Grid with `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))` and gap
- `.ref-card` — card with border-radius, shadow, hover lift effect, overflow hidden
- `.ref-card-image` — aspect-ratio 16/9, background-size cover, background-position center, with fallback gradient
- `.ref-card-body` — padding with title, description (2-line clamp), tags, meta
- `.ref-card-tags` — flex wrap row of small pill-shaped tag badges
- `.ref-card-domain` — small badge overlaid on image bottom-left
- `.ref-sub-nav` — tab toggle for All References / Mood Boards
- `.moodboard-card` — larger card with mini-collage of 4 thumbnails
- `.ref-detail-modal` — slide-in panel or modal for editing reference details
- `.ref-empty-state` — centered empty state illustration

Follow existing style patterns (Inter font, same color palette, same border-radius/shadow as `.task-card`).

**Step 2: Commit**

```bash
git add src/style.css
git commit -m "feat: add CSS styles for references grid, cards, and mood boards"
```

---

### Task 9: Update CLAUDE.md — Document new collections, endpoints, and indexes

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update documentation**

Add to the relevant sections:
- **API Endpoints table:** Add all new references and moodboards endpoints
- **Firestore Collections:** Add `references` and `moodboards` with their fields
- **Firestore Indexes:** Add the 4 new references indexes
- **Project Structure:** Add `src/references.js`

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with references library collections, endpoints, and indexes"
```

---

## Execution Summary

| Task | What | Files | Commit |
|------|------|-------|--------|
| 1 | Firestore rules | `firestore.rules` | `feat: add Firestore security rules for references and moodboards` |
| 2 | Firestore indexes | `firestore.indexes.json` | `feat: add composite Firestore indexes for references collection` |
| 3 | Backend API | `functions/index.js` | `feat: add API endpoints for references CRUD, search, preview, and moodboards` |
| 4 | Frontend DB layer | `src/db.js` | `feat: add Firestore CRUD functions for references and moodboards` |
| 5 | References view | `src/references.js` (create) | `feat: add references view with card grid, search, and filters` |
| 6 | Mood boards | (part of Task 5) | — |
| 7 | Nav + routing | `index.html`, `src/main.js` | `feat: wire up References nav tab and routing` |
| 8 | CSS styles | `src/style.css` | `feat: add CSS styles for references grid, cards, and mood boards` |
| 9 | Documentation | `CLAUDE.md` | `docs: update CLAUDE.md with references library` |

**Total: 8 commits across 7 files (1 new, 6 modified)**
