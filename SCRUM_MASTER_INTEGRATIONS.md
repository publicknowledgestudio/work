# Task Management Systems for Claude as Scrum Master in Slack

This document outlines task management systems that can integrate with Slack, enabling Claude to act as a scrum master within a Slack channel.

## Overview

For Claude to function as a scrum master in Slack, the task management system needs:
1. **API access** - To read/write tasks, sprints, and user stories
2. **Slack integration** - Native or via webhooks
3. **Automation capabilities** - To trigger standup prompts, sprint reviews, etc.

---

## Supported Task Management Systems

### 1. **GitHub Issues & Projects**
**Integration Level: Excellent**

GitHub Projects (v2) provides a powerful project management system that integrates seamlessly with Slack.

**Capabilities:**
- Create/update/close issues via API
- Manage project boards and sprints
- Track story points and velocity
- Native Slack app for notifications

**Scrum Master Actions Claude Can Perform:**
- Create and prioritize backlog items
- Move issues through sprint columns
- Generate sprint reports and burndown data
- Facilitate daily standups by querying open tasks
- Create retrospective summaries

**Setup:** GitHub App + Slack GitHub integration

---

### 2. **Linear**
**Integration Level: Excellent**

Linear is a modern issue tracker with excellent API and Slack support.

**Capabilities:**
- GraphQL API for full CRUD operations
- Native Slack integration with bidirectional sync
- Cycles (sprints) with automatic tracking
- Roadmap and project views

**Scrum Master Actions Claude Can Perform:**
- Create issues and sub-issues
- Manage cycles/sprints
- Query team velocity and cycle progress
- Post daily standup summaries
- Triage incoming issues

**Setup:** Linear API key + Slack Linear app

---

### 3. **Jira**
**Integration Level: Good**

The industry standard for enterprise agile teams.

**Capabilities:**
- REST API for all operations
- Slack integration via Atlassian app
- Sprints, boards, and advanced reporting
- Custom workflows

**Scrum Master Actions Claude Can Perform:**
- Create/update tickets
- Manage sprint backlogs
- Generate sprint reports
- Facilitate ceremony scheduling
- Query JQL for status updates

**Setup:** Jira API token + Slack Jira Cloud app

---

### 4. **Notion**
**Integration Level: Good**

Flexible workspace that can be configured for agile workflows.

**Capabilities:**
- Database API for task management
- Slack integration for notifications
- Customizable views (Kanban, timeline, etc.)
- Rich content support for documentation

**Scrum Master Actions Claude Can Perform:**
- Create and update database entries
- Query sprint databases
- Generate meeting notes and summaries
- Track team capacity

**Setup:** Notion API integration + Slack Notion app

---

### 5. **Asana**
**Integration Level: Good**

Work management platform with strong API support.

**Capabilities:**
- REST API for project/task management
- Native Slack integration
- Timeline and board views
- Goals and portfolio tracking

**Scrum Master Actions Claude Can Perform:**
- Create tasks and subtasks
- Manage project sections (sprint columns)
- Generate progress reports
- Assign and track work

**Setup:** Asana API token + Slack Asana app

---

### 6. **Trello**
**Integration Level: Moderate**

Simple Kanban-style boards, good for smaller teams.

**Capabilities:**
- REST API for board/card management
- Power-Ups for extended functionality
- Slack integration via Trello app

**Scrum Master Actions Claude Can Perform:**
- Create/move cards
- Manage lists as sprint columns
- Add checklists for acceptance criteria
- Track card aging and blockers

**Setup:** Trello API key + Slack Trello app

---

### 7. **Shortcut (formerly Clubhouse)**
**Integration Level: Good**

Built specifically for software teams with strong API.

**Capabilities:**
- REST API with excellent documentation
- Native Slack integration
- Iterations (sprints) and epics
- Velocity tracking

**Scrum Master Actions Claude Can Perform:**
- Manage stories and iterations
- Create epics and milestones
- Generate velocity reports
- Facilitate workflow transitions

**Setup:** Shortcut API token + Slack Shortcut app

---

### 8. **ClickUp**
**Integration Level: Good**

All-in-one productivity platform.

**Capabilities:**
- Comprehensive API
- Native Slack integration
- Sprints and agile features
- Time tracking and goals

**Scrum Master Actions Claude Can Perform:**
- Create tasks with custom fields
- Manage sprint folders
- Track time and estimates
- Generate dashboards

**Setup:** ClickUp API key + Slack ClickUp app

---

### 9. **Plain Markdown/Git-based (Lightweight)**
**Integration Level: Native**

Use this repository itself with markdown files for simple task tracking.

**Capabilities:**
- Full version control
- Pull request workflow
- GitHub Actions for automation
- No external dependencies

**Scrum Master Actions Claude Can Perform:**
- Maintain BACKLOG.md, SPRINT.md files
- Create PRs for sprint planning
- Generate standup templates
- Track tasks via markdown checkboxes

**Setup:** Just this repo + GitHub Slack app

---

## Recommended Approach for This Channel

Given Claude's capabilities in Slack, the **recommended systems** are:

| Priority | System | Why |
|----------|--------|-----|
| 1st | **GitHub Issues/Projects** | Native to this repo, excellent API, free |
| 2nd | **Linear** | Modern UX, excellent Slack sync, great API |
| 3rd | **Git-based Markdown** | Zero dependencies, version controlled |

---

## Scrum Master Functions Claude Can Perform

Regardless of the system chosen, Claude can facilitate:

### Daily Operations
- [ ] Morning standup prompts ("What did you do yesterday? What's planned today? Any blockers?")
- [ ] Blocker tracking and escalation
- [ ] Task assignment and rebalancing
- [ ] Progress summaries

### Sprint Ceremonies
- [ ] Sprint planning facilitation
- [ ] Backlog grooming/refinement
- [ ] Sprint review summaries
- [ ] Retrospective facilitation and action item tracking

### Reporting
- [ ] Burndown/burnup charts (data)
- [ ] Velocity tracking
- [ ] Sprint goal progress
- [ ] Team capacity monitoring

### Administrative
- [ ] Creating tickets from Slack conversations
- [ ] Linking discussions to tasks
- [ ] Meeting scheduling reminders
- [ ] Definition of Done enforcement

---

## Next Steps

To enable Claude as scrum master in this channel:

1. **Choose a task management system** from the options above
2. **Set up API access** for Claude to interact with the system
3. **Configure Slack integration** for bidirectional updates
4. **Define scrum workflow** (sprint length, ceremonies, etc.)

Let me know which system you'd like to proceed with!
