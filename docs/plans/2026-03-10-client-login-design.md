# Client Login — Design Document

**Date:** 2026-03-10
**Status:** Approved
**Author:** Gyan + Claude

## Overview

Add the ability for external client users to log into PK Work, view their projects, manage tasks, and see aggregated timesheets. Client users are invited by PK team members and scoped to a single client org — they see all projects under that client.

## Architecture: Firestore Rules + Client Role

Extend the existing Firebase Auth + Firestore rules system. No separate backend or Firebase project needed. Client users authenticate with Google sign-in (any domain), and a `clientUsers` allowlist collection determines their access scope.

---

## 1. Data Model

### New collection: `clientUsers/{email}`

```json
{
  "email": "jane@clientco.com",
  "name": "Jane Smith",
  "clientId": "abc123",
  "invitedBy": "gyan@publicknowledge.co",
  "createdAt": "2026-03-10T..."
}
```

- **Document ID** = email address (lowercase)
- **clientId** links to the existing `clients` collection
- **invitedBy** tracks which PK team member added them
- One document per client user. To revoke access, delete the document.

### No changes to existing collections

Tasks, projects, clients, etc. keep their current schema. Client scoping is handled entirely by Firestore rules reading `clientUsers/{email}.clientId`.

---

## 2. Firestore Rules

### New helper functions

```javascript
function isClientUser() {
  return request.auth != null &&
    exists(/databases/$(database)/documents/clientUsers/$(request.auth.token.email));
}

function clientIdForUser() {
  return get(/databases/$(database)/documents/clientUsers/$(request.auth.token.email)).data.clientId;
}
```

### Access matrix

| Collection | Team | Client |
|-----------|------|--------|
| tasks | Full CRUD | Read + write where `clientId == clientIdForUser()` |
| projects | Full CRUD | Read where `clientId == clientIdForUser()` |
| clients | Full CRUD | Read own client doc only |
| clientUsers | Full CRUD | Read own doc only |
| standups | Full CRUD | No access |
| sprints | Full CRUD | No access |
| dailyFocus | Full CRUD | No access |
| users | Full CRUD | No access |
| notes | Full CRUD | No access |
| references | Full CRUD | No access |
| moodboards | Full CRUD | No access |
| processes | Full CRUD | No access |

### Updated rules (key collections)

```javascript
// Tasks — clients can read/write tasks matching their clientId
match /tasks/{taskId} {
  allow read: if isTeamMember();
  allow read: if isClientUser() && resource.data.clientId == clientIdForUser();
  allow create: if isTeamMember();
  allow create: if isClientUser() && request.resource.data.clientId == clientIdForUser();
  allow update: if isTeamMember();
  allow update: if isClientUser() && resource.data.clientId == clientIdForUser()
                   && request.resource.data.clientId == clientIdForUser();
  allow delete: if isTeamMember();
}

// Projects — clients can read their projects
match /projects/{projectId} {
  allow read: if isTeamMember();
  allow read: if isClientUser() && resource.data.clientId == clientIdForUser();
  allow write: if isTeamMember();
}

// Clients — clients can read their own client doc
match /clients/{clientId} {
  allow read: if isTeamMember();
  allow read: if isClientUser() && clientId == clientIdForUser();
  allow write: if isTeamMember();
}

// Client users — team has full access, clients can read own doc
match /clientUsers/{email} {
  allow read, write: if isTeamMember();
  allow read: if isClientUser() && email == request.auth.token.email;
}
```

**Note:** Client update rules prevent changing the `clientId` on a task (both `resource.data.clientId` and `request.resource.data.clientId` must match their org).

---

## 3. Auth Flow & Routing

### Login

1. Landing page shows Google sign-in button (same as now)
2. Google sign-in popup allows **any Google account** (remove `hd` restriction)
3. After auth, check role:
   - Email ends with `@publicknowledge.co` → team member → normal app
   - Email exists in `clientUsers` collection → client user → client view
   - Neither → show "Access denied. Contact your project manager." + sign out

### State

```javascript
// New state in main.js
let userRole = null    // 'team' | 'client' | null
let userClientId = null // only set for client users
let userClientName = null
```

### Routing

- **Team:** existing routes unchanged (`#board`, `#my-tasks`, `#my-day`, `#standup`, `#manage`, `#references`)
- **Client:** new routes
  - `#client-board` — kanban view filtered to their client's projects (default landing)
  - `#client-timesheets` — aggregated timesheet view
- Sidebar/nav adapts based on `userRole`

### Header

- **Team:** "PK Work" (existing)
- **Client:** "Public Knowledge for [Client Name]"

---

## 4. Client Management UI

### Location: Manage page (existing)

Add a "Client Users" section to the existing Manage page (alongside Clients and Projects).

### UI

- Table listing current client users: name, email, client, invited by, date
- "Invite Client User" button opens a form:
  - Email (text input, required)
  - Name (text input, required)
  - Client (dropdown of existing clients, required)
- Delete button per row to revoke access

### Share URL

After inviting, show a copyable link:
```
https://work.publicknowledge.co
```

The client navigates there, signs in with their Google account, and the system recognizes them from the `clientUsers` allowlist.

---

## 5. Client Views

### Client Board (`#client-board`)

- Same kanban layout as the team board
- `clientId` filter is locked to the user's client org (not changeable)
- Project filter dropdown shows only their client's projects
- Full task CRUD: create, edit, drag between columns, delete
- Task creation auto-sets `clientId` to their client org
- Assignee picker shows PK team members (clients assign work to PK team)

### Client Timesheets (`#client-timesheets`)

- Date range picker (default: current week)
- Aggregated view only — no per-person breakdown
- Columns: Project | Task | Status | Hours
- Data source: tasks with `closedAt` in the date range (or status-based tracking)
- Shows total hours per project and grand total

---

## 6. API Changes

The Cloud Functions API (`x-api-key` auth) is used by Asty/OpenClaw, not by the web app directly. No API changes needed for client login — the web app uses Firestore SDK directly with Firebase Auth, and the security rules handle access control.

If client API access is needed later (e.g., client-facing integrations), it would require a separate auth mechanism since the current API uses a shared key.

---

## 7. Firestore Indexes

New composite indexes needed:

| Collection | Fields | Purpose |
|-----------|--------|---------|
| clientUsers | clientId ASC + createdAt DESC | List client users by client |

Existing task indexes with `clientId` should already cover client board queries.

---

## 8. Migration

- No data migration needed
- Existing collections unchanged
- Deploy order: Firestore rules first, then hosting
- `clientUsers` collection starts empty — team invites users as needed

---

## Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth method | Google sign-in (any domain) | Familiar flow, no password management |
| Task visibility | All statuses | Clients see full pipeline |
| Edit scope | All task fields | Trust clients to participate fully |
| Client landing | Project board (kanban) | Matches team's mental model |
| Multi-project | Client org scoping | One login sees all projects for their client |
| Timesheet detail | Aggregated only | Protects team member privacy |
| Invite flow | Allowlist + share URL | No email infra needed |
| Architecture | Firestore rules + client role | Minimal infra, leverages existing auth |
| Header text | "Public Knowledge for [Client Name]" | Per user request |
