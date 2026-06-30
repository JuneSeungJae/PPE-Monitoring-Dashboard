export async function fetchLatestAlerts() {
  const response = await fetch('/api/event/latest')
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status}`)
  }

  const data = await response.json()
  if (!Array.isArray(data)) return []
  return data
}

export async function patchAlertStatus(alertId, payload) {
  const response = await fetch(`/api/event/${alertId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Failed to update event status: ${response.status}`)
  }

  return response.json()
}
