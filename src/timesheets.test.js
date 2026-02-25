import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as db from './db.js'

// Mock dependencies
vi.mock('./db.js', () => ({
  loadAllDailyFocusForRange: vi.fn(),
}))

vi.mock('./config.js', () => ({
  TEAM: [
    { email: 'alice@example.com', name: 'Alice' },
    { email: 'bob@example.com', name: 'Bob' },
  ],
}))

// Import after mocking
import { renderTimesheets } from './timesheets.js'

describe('timesheets.js', () => {
  let container
  let mockTasks
  let mockCtx

  beforeEach(() => {
    vi.clearAllMocks()

    // Create a fresh DOM container
    container = document.createElement('div')
    document.body.appendChild(container)

    mockCtx = {
      db: { _type: 'firestore' },
      clients: [
        {
          id: 'client-1',
          name: 'Acme Corp',
          logoUrl: 'https://example.com/logo.png',
          defaultHourlyRate: 100,
          currency: 'USD'
        },
        {
          id: 'client-2',
          name: 'Beta Inc',
          defaultHourlyRate: 150,
          currency: 'INR'
        },
      ],
      projects: [
        {
          id: 'proj-1',
          name: 'Project Alpha',
          clientId: 'client-1',
          hourlyRate: 120,
          currency: 'USD'
        },
        {
          id: 'proj-2',
          name: 'Project Beta',
          clientId: 'client-1',
          hourlyRate: 80,
          currency: 'USD'
        },
      ],
    }

    mockTasks = [
      {
        id: 'task-1',
        title: 'Task One',
        clientId: 'client-1',
        projectId: 'proj-1'
      },
      {
        id: 'task-2',
        title: 'Task Two',
        clientId: 'client-1',
        projectId: 'proj-2'
      },
    ]
  })

  afterEach(() => {
    if (container.parentNode) {
      document.body.removeChild(container)
    }
  })

  describe('renderTimesheets', () => {
    it('should render initial UI with controls', async () => {
      vi.mocked(db.loadAllDailyFocusForRange).mockResolvedValue([])

      await renderTimesheets(container, mockTasks, mockCtx)

      expect(container.querySelector('.timesheets-view')).toBeTruthy()
      expect(container.querySelector('h2').textContent).toBe('Timesheets')
      expect(container.querySelector('#ts-client')).toBeTruthy()
      expect(container.querySelector('#ts-month')).toBeTruthy()
      expect(container.querySelector('#ts-print')).toBeTruthy()
    })

    it('should populate client dropdown with all clients', async () => {
      vi.mocked(db.loadAllDailyFocusForRange).mockResolvedValue([])

      await renderTimesheets(container, mockTasks, mockCtx)

      const clientSelect = container.querySelector('#ts-client')
      const options = Array.from(clientSelect.querySelectorAll('option'))

      expect(options).toHaveLength(3) // "Select a client..." + 2 clients
      expect(options[0].textContent).toBe('Select a client...')
      expect(options[1].textContent).toBe('Acme Corp')
      expect(options[2].textContent).toBe('Beta Inc')
    })

    it('should set default month to current month', async () => {
      vi.mocked(db.loadAllDailyFocusForRange).mockResolvedValue([])

      await renderTimesheets(container, mockTasks, mockCtx)

      const monthInput = container.querySelector('#ts-month')
      const now = new Date()
      const expectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

      expect(monthInput.value).toBe(expectedMonth)
    })

    it('should hide print button initially when no client selected', async () => {
      vi.mocked(db.loadAllDailyFocusForRange).mockResolvedValue([])

      await renderTimesheets(container, mockTasks, mockCtx)

      const printBtn = container.querySelector('#ts-print')
      expect(printBtn.classList.contains('hidden')).toBe(true)
    })
  })

  describe('Timesheet Generation', () => {
    it('should show empty state when no time blocks found', async () => {
      vi.mocked(db.loadAllDailyFocusForRange).mockResolvedValue([])

      await renderTimesheets(container, mockTasks, mockCtx)

      const clientSelect = container.querySelector('#ts-client')
      const monthInput = container.querySelector('#ts-month')

      clientSelect.value = 'client-1'
      monthInput.value = '2026-03'
      clientSelect.dispatchEvent(new Event('change'))

      await new Promise(resolve => setTimeout(resolve, 100))

      const resultEl = container.querySelector('#ts-result')
      expect(resultEl.textContent).toContain('No tracked time found')
    })

    it('should generate timesheet with time blocks', async () => {
      vi.mocked(db.loadAllDailyFocusForRange).mockResolvedValue([
        {
          id: 'alice_2026-02-15',
          date: '2026-02-15',
          userEmail: 'alice@example.com',
          timeBlocks: [
            { taskId: 'task-1', start: '09:00', end: '11:00' }, // 2 hours
          ],
        },
      ])

      await renderTimesheets(container, mockTasks, mockCtx)

      const clientSelect = container.querySelector('#ts-client')
      const monthInput = container.querySelector('#ts-month')

      clientSelect.value = 'client-1'
      monthInput.value = '2026-02'
      clientSelect.dispatchEvent(new Event('change'))

      await new Promise(resolve => setTimeout(resolve, 150))

      const resultEl = container.querySelector('#ts-result')
      expect(resultEl.textContent).toContain('Task One')
      expect(resultEl.textContent).toContain('2h')
    })

    it('should calculate correct date range for February', async () => {
      vi.mocked(db.loadAllDailyFocusForRange).mockResolvedValue([])

      await renderTimesheets(container, mockTasks, mockCtx)

      const clientSelect = container.querySelector('#ts-client')
      const monthInput = container.querySelector('#ts-month')

      clientSelect.value = 'client-1'
      monthInput.value = '2026-02'
      clientSelect.dispatchEvent(new Event('change'))

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(db.loadAllDailyFocusForRange).toHaveBeenCalledWith(
        mockCtx.db,
        '2026-02-01',
        '2026-02-28'
      )
    })

    it('should generate empty timesheet for month with no data', async () => {
      vi.mocked(db.loadAllDailyFocusForRange).mockResolvedValue([])

      await renderTimesheets(container, mockTasks, mockCtx)

      const clientSelect = container.querySelector('#ts-client')
      const monthInput = container.querySelector('#ts-month')

      clientSelect.value = 'client-1'
      monthInput.value = '2025-12' // A past month with no data
      monthInput.dispatchEvent(new Event('change'))

      await new Promise(resolve => setTimeout(resolve, 100))

      const resultEl = container.querySelector('#ts-result')
      // Should show empty state for valid month with no data
      expect(resultEl.textContent).toContain('No tracked time found')
    })

    it('should clear result when client is deselected', async () => {
      vi.mocked(db.loadAllDailyFocusForRange).mockResolvedValue([])

      await renderTimesheets(container, mockTasks, mockCtx)

      const clientSelect = container.querySelector('#ts-client')

      // First select a client
      clientSelect.value = 'client-1'
      clientSelect.dispatchEvent(new Event('change'))
      await new Promise(resolve => setTimeout(resolve, 100))

      // Then deselect
      clientSelect.value = ''
      clientSelect.dispatchEvent(new Event('change'))

      const resultEl = container.querySelector('#ts-result')
      expect(resultEl.innerHTML).toBe('')
    })
  })

  describe('Print Functionality', () => {
    it('should call window.print when print button clicked', async () => {
      // Mock window.print
      window.print = vi.fn()

      vi.mocked(db.loadAllDailyFocusForRange).mockResolvedValue([
        {
          id: 'alice_2026-02-15',
          date: '2026-02-15',
          userEmail: 'alice@example.com',
          timeBlocks: [
            { taskId: 'task-1', start: '09:00', end: '10:00' },
          ],
        },
      ])

      await renderTimesheets(container, mockTasks, mockCtx)

      const clientSelect = container.querySelector('#ts-client')
      clientSelect.value = 'client-1'
      clientSelect.dispatchEvent(new Event('change'))

      await new Promise(resolve => setTimeout(resolve, 100))

      const printBtn = container.querySelector('#ts-print')
      printBtn.click()

      expect(window.print).toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('should handle midnight crossing correctly', async () => {
      vi.mocked(db.loadAllDailyFocusForRange).mockResolvedValue([
        {
          date: '2026-02-15',
          userEmail: 'alice@example.com',
          timeBlocks: [
            { taskId: 'task-1', start: '23:00', end: '01:00' }, // Crosses midnight: 2 hours
          ],
        },
      ])

      await renderTimesheets(container, mockTasks, mockCtx)

      const clientSelect = container.querySelector('#ts-client')
      clientSelect.value = 'client-1'
      clientSelect.dispatchEvent(new Event('change'))

      await new Promise(resolve => setTimeout(resolve, 100))

      const resultEl = container.querySelector('#ts-result')
      expect(resultEl.textContent).toContain('2h')
    })

    it('should handle zero duration blocks', async () => {
      vi.mocked(db.loadAllDailyFocusForRange).mockResolvedValue([
        {
          date: '2026-02-15',
          userEmail: 'alice@example.com',
          timeBlocks: [
            { taskId: 'task-1', start: '09:00', end: '09:00' }, // Zero duration
          ],
        },
      ])

      await renderTimesheets(container, mockTasks, mockCtx)

      const clientSelect = container.querySelector('#ts-client')
      clientSelect.value = 'client-1'
      clientSelect.dispatchEvent(new Event('change'))

      await new Promise(resolve => setTimeout(resolve, 100))

      const resultEl = container.querySelector('#ts-result')
      // Should show 0m
      expect(resultEl.textContent).toContain('0m')
    })

    it('should filter clients without names', async () => {
      mockCtx.clients.push({ id: 'client-3', name: '' })

      await renderTimesheets(container, mockTasks, mockCtx)

      const clientSelect = container.querySelector('#ts-client')
      const options = Array.from(clientSelect.querySelectorAll('option'))

      // Should still only have 2 named clients + default option
      expect(options).toHaveLength(3)
    })
  })

  describe('Time Aggregation', () => {
    it('should aggregate time across multiple days', async () => {
      vi.mocked(db.loadAllDailyFocusForRange).mockResolvedValue([
        {
          date: '2026-02-15',
          userEmail: 'alice@example.com',
          timeBlocks: [
            { taskId: 'task-1', start: '09:00', end: '11:00' }, // 2 hours
          ],
        },
        {
          date: '2026-02-16',
          userEmail: 'alice@example.com',
          timeBlocks: [
            { taskId: 'task-1', start: '10:00', end: '12:00' }, // 2 hours
          ],
        },
      ])

      await renderTimesheets(container, mockTasks, mockCtx)

      const clientSelect = container.querySelector('#ts-client')
      clientSelect.value = 'client-1'
      clientSelect.dispatchEvent(new Event('change'))

      await new Promise(resolve => setTimeout(resolve, 100))

      const resultEl = container.querySelector('#ts-result')
      // Should show 4h total
      expect(resultEl.textContent).toContain('4h')
    })

    it('should handle fractional hours correctly', async () => {
      vi.mocked(db.loadAllDailyFocusForRange).mockResolvedValue([
        {
          date: '2026-02-15',
          userEmail: 'alice@example.com',
          timeBlocks: [
            { taskId: 'task-1', start: '09:00', end: '10:30' }, // 1.5 hours
          ],
        },
      ])

      await renderTimesheets(container, mockTasks, mockCtx)

      const clientSelect = container.querySelector('#ts-client')
      clientSelect.value = 'client-1'
      clientSelect.dispatchEvent(new Event('change'))

      await new Promise(resolve => setTimeout(resolve, 100))

      const resultEl = container.querySelector('#ts-result')
      expect(resultEl.textContent).toContain('1h 30m')
    })
  })
})