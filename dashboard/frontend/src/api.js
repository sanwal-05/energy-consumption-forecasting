const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';

async function requestJson(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export function fetchSummary() {
  return requestJson('/api/summary');
}

export function fetchTrends({ granularity = 'day', start = '', end = '', household = '' } = {}) {
  const params = new URLSearchParams();
  params.set('granularity', granularity);
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  if (household !== '' && household !== null && household !== undefined) {
    params.set('household', String(household));
  }
  return requestJson(`/api/trends?${params.toString()}`);
}

export function fetchPredictions({ start = '', end = '' } = {}) {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  const qs = params.toString();
  return requestJson(`/api/predictions${qs ? `?${qs}` : ''}`);
}

export function fetchModels() {
  return requestJson('/api/models');
}

export function fetchInsights() {
  return requestJson('/api/insights');
}

export function fetchRecommendations() {
  return requestJson('/api/recommendations');
}

export function postSimulate({ adoption_rate, peak_hour_shift }) {
  return requestJson('/api/simulate', {
    method: 'POST',
    body: JSON.stringify({
      adoption_rate: Number(adoption_rate),
      peak_hour_shift: Number(peak_hour_shift),
    }),
  });
}
