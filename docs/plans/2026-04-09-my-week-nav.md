# My Week Navigation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add prev/next week arrows to the My Week header so users can navigate week by week.

**Architecture:** Add a `weekOffset` module-level variable (0 = current week, -1 = last week, +1 = next week). Shift the `monday` calculation by `weekOffset * 7` days. Add arrow buttons next to the date line. Re-render on click.

**Tech Stack:** Vanilla JS, existing CSS patterns

---

### Task 1: Add weekOffset state and shift monday calculation

**Files:**
- Modify: `src/my-day.js:11-31` (add weekOffset, shift monday)
- Modify: `src/my-day.js:226-237` (add nav arrows to HTML)
- Modify: `src/my-day.js:187-189` (adjust greeting for non-current week)

**Step 1: Add `weekOffset` variable**

At `src/my-day.js:14`, after the `calendarDate` line, add:

```js
let weekOffset = 0 // 0 = current week, -1 = prev, +1 = next
```

Also export a reset function so navigation back to My Week resets offset:

```js
export function resetWeekOffset() { weekOffset = 0 }
```

**Step 2: Shift `monday` by weekOffset**

At line 30-31, after computing monday from `now`, add:

```js
monday.setDate(monday.getDate() + (weekOffset * 7))
```

**Step 3: Compute display date range for the header**

After the weekDates loop (around line 46), add:

```js
const weekStart = weekDates[0].date
const weekEnd = weekDates[6].date
const weekRangeStr = weekOffset === 0
  ? formatDate(now)
  : `${weekStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
```

**Step 4: Update the header HTML**

Replace the date paragraph (line 237):

```html
<p class="my-day-date">${formatDate(now)}</p>
```

With:

```html
<div class="my-day-date week-nav">
  <button class="week-nav-btn" id="week-prev" title="Previous week"><i class="ph ph-caret-left"></i></button>
  <span class="week-nav-label" id="week-label">${weekRangeStr}</span>
  <button class="week-nav-btn" id="week-next" title="Next week"><i class="ph ph-caret-right"></i></button>
</div>
```

**Step 5: Adjust greeting for non-current week**

At line 187-189, wrap the greeting to handle past/future weeks:

```js
const greetingText = isOwnDay
  ? (weekOffset === 0
    ? `${greeting()}, ${esc(viewingName.split(' ')[0])}`
    : `${esc(viewingName.split(' ')[0])}'s Week`)
  : `${esc(viewingName.split(' ')[0])}'s Week`
```

**Step 6: Add click handlers for week nav buttons**

After the existing event listeners in renderMyDay (look for where other click handlers are bound), add:

```js
document.getElementById('week-prev')?.addEventListener('click', () => {
  weekOffset--
  renderMyDay(container, tasks, currentUser, ctx)
})
document.getElementById('week-next')?.addEventListener('click', () => {
  weekOffset++
  renderMyDay(container, tasks, currentUser, ctx)
})
document.getElementById('week-label')?.addEventListener('click', () => {
  weekOffset = 0
  renderMyDay(container, tasks, currentUser, ctx)
})
```

**Step 7: Commit**

```bash
git add src/my-day.js
git commit -m "feat: add week-by-week navigation to My Week view"
```

---

### Task 2: CSS for week nav buttons

**Files:**
- Modify: `src/style.css` (append styles)

**Step 1: Add week nav styles**

Append to `src/style.css`:

```css
/* ===== Week Navigation ===== */

.week-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.week-nav-btn {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}

.week-nav-btn:hover {
  background: var(--border);
  color: var(--text);
}

.week-nav-label {
  cursor: pointer;
  border-radius: 6px;
  padding: 0 4px;
}

.week-nav-label:hover {
  background: var(--border);
}
```

**Step 2: Commit**

```bash
git add src/style.css
git commit -m "feat: add week nav button styles"
```

---

### Task 3: Build and deploy

```bash
npm run deploy
git push
```
