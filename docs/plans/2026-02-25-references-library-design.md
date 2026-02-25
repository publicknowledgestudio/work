# References Library — Design Document

**Date:** 2026-02-25
**Status:** Approved
**Approach:** Firestore-Native Library

## Problem

The PK Studio team shares design references, inspiration links, Figma files, and articles in Slack's #references channel. Today these references disappear into scroll history — they can't be browsed, searched, filtered, or organized. Asty passively stores them into mem0 but the storage is opaque and not queryable by the team. There's no visual library, no tagging, no client/project linking, and no proactive surfacing when relevant work begins.

## Solution

A visual reference library integrated into PK Work (work.publicknowledge.co) with:

- **Auto-ingestion** from Slack #references via Asty's upgraded `references-sync` cron job
- **OG metadata** (title, description, image) fetched automatically for link previews
- **AI-powered auto-tagging** by Asty using Claude (typography, color, layout, etc.)
- **Client/project linking** so references are organized by who they're for
- **Mood boards** — named collections of references grouped per client/project
- **Proactive surfacing** — Asty shares relevant past references when work begins on a client

## Data Model

### `references` collection

```
references/{id}
  url: string               // The shared URL
  title: string             // From OG metadata
  description: string       // From OG metadata
  imageUrl: string          // OG image URL (hotlinked)
  tags: string[]            // AI-generated: ["typography", "brutalist", "dark-mode"]
  clientId: string | null   // Linked client
  projectId: string | null  // Linked project
  sharedBy: string          // Slack user who posted it
  slackMessageTs: string    // Slack message timestamp (dedup + linking back)
  slackChannel: string      // Channel ID
  createdAt: Timestamp
```

### `moodboards` collection

```
moodboards/{id}
  name: string              // e.g., "Hammock — Packaging Inspiration"
  description: string
  referenceIds: string[]    // Array of reference doc IDs
  clientId: string | null
  projectId: string | null
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
```

### Auto-generated tag categories

`typography`, `color`, `layout`, `illustration`, `photography`, `motion`, `brutalist`, `minimal`, `3d`, `packaging`, `brand-identity`, `web-design`, `editorial`, and more as Asty encounters new types.

## API Endpoints

All on the existing `api` Cloud Function, authenticated via `x-api-key` header.

### References

| Method | Path | Description |
|--------|------|-------------|
| GET | `/references` | List references. Filters: `?clientId=x&projectId=x&tag=x&sharedBy=x&limit=20&offset=0` |
| POST | `/references` | Create reference |
| PATCH | `/references/:id` | Update reference (edit tags, link to client/project) |
| DELETE | `/references/:id` | Delete reference |
| GET | `/references/search` | Search by text query across title, description, tags |
| GET | `/references/preview` | Fetch OG metadata for a URL without saving. Query: `?url=...`. Returns `{ title, description, imageUrl }` |

### Mood Boards

| Method | Path | Description |
|--------|------|-------------|
| GET | `/moodboards` | List mood boards. Filters: `?clientId=x&projectId=x` |
| POST | `/moodboards` | Create mood board |
| PATCH | `/moodboards/:id` | Update mood board (add/remove references, rename) |
| DELETE | `/moodboards/:id` | Delete mood board |

## Frontend Design

New "References" view in PK Work navigation, alongside Board and My Tasks.

### Layout

- **Top bar:** Search input + filter chips (client, project, tag, shared by)
- **Main area:** Responsive grid of reference cards
- **Each card:** OG image thumbnail, title, source domain, tag pills, who shared, date
- **Card click:** Detail panel/modal — full description, original link, edit tags/client/project, link to Slack message
- **Mood boards tab:** Toggle between "All References" and "Mood Boards" — mood boards show as named collections

### Firestore Indexes Required

| Collection | Fields | Purpose |
|------------|--------|---------|
| references | clientId ASC + createdAt DESC | Filter by client |
| references | projectId ASC + createdAt DESC | Filter by project |
| references | tags CONTAINS + createdAt DESC | Filter by tag |
| references | sharedBy ASC + createdAt DESC | Filter by who shared |

## Asty Integration

### Upgraded `references-sync` cron job

When processing new messages in #references:

1. Extract URLs from the Slack message
2. Call `GET /references/preview?url=...` to fetch OG metadata
3. Call Claude to auto-generate tags based on URL content and metadata
4. Call `POST /references` to save with structured data
5. Deduplicate using `slackMessageTs`

### New OpenClaw tools

| Tool | Purpose |
|------|---------|
| `pkwork_add_reference` | Save a new reference with metadata |
| `pkwork_list_references` | List/filter references |
| `pkwork_search_references` | Search references by text |
| `pkwork_create_moodboard` | Create a mood board from reference IDs |
| `pkwork_surface_references` | Find relevant references for a client/project |

### Proactive surfacing

When work begins on a client (new task created, standup mentions a project), Asty can proactively post relevant past references in the thread or DM.

## Out of Scope (for v1)

- Storing images in Firebase Storage (hotlink OG images for now)
- Full-page screenshots of referenced sites
- Manual reference adding via the web UI (ingestion is Slack-only for v1)
- Browser extension / bookmarklet
- Reference voting / favoriting
