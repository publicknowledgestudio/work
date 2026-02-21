// Google Calendar integration — client-side via REST API
// Uses OAuth access token from Firebase Google sign-in
//
// Token lifecycle:
// - Captured on signInWithPopup (stored in memory + sessionStorage)
// - Expires after ~1hr; on 401 we clear it and show "Connect Calendar" button
// - User clicks "Connect Calendar" → triggers re-auth popup → fresh token

const STORAGE_KEY = 'pk_gcal_token'

let accessToken = null
try {
  accessToken = sessionStorage.getItem(STORAGE_KEY) || null
} catch (_) {
  // Storage may be blocked in cross-origin contexts
}

export function setAccessToken(token) {
  accessToken = token
  try {
    if (token) {
      sessionStorage.setItem(STORAGE_KEY, token)
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  } catch (_) {
    // Storage may be blocked
  }
}

export function getAccessToken() {
  return accessToken
}

export function clearAccessToken() {
  accessToken = null
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch (_) {
    // Storage may be blocked
  }
}

// Fetch today's calendar events for the signed-in user
export async function loadCalendarEvents(dateStr) {
  if (!accessToken) return { events: [], needsAuth: true }

  const dayStart = new Date(dateStr + 'T00:00:00')
  const dayEnd = new Date(dateStr + 'T23:59:59')

  const params = new URLSearchParams({
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (res.status === 401 || res.status === 403) {
      const body = await res.json().catch(() => ({}))
      console.warn('Calendar API auth error:', res.status, body?.error?.message || '')
      clearAccessToken()
      return { events: [], needsAuth: true }
    }

    if (!res.ok) return { events: [], needsAuth: false }

    const data = await res.json()
    return { events: parseEvents(data.items || []), needsAuth: false }
  } catch (err) {
    console.warn('Calendar fetch error:', err)
    return { events: [], needsAuth: false }
  }
}

function parseEvents(items) {
  return items
    .filter((e) => e.status !== 'cancelled')
    .map((e) => ({
      id: e.id,
      summary: e.summary || '(No title)',
      start: e.start?.dateTime || e.start?.date || '',
      end: e.end?.dateTime || e.end?.date || '',
      allDay: !e.start?.dateTime,
      hangoutLink: e.hangoutLink || e.conferenceData?.entryPoints?.[0]?.uri || '',
      htmlLink: e.htmlLink || '',
      location: e.location || '',
      attendees: (e.attendees || []).length,
    }))
}
