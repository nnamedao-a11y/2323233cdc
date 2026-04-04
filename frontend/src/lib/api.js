/**
 * API Helper
 */

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  
  const res = await fetch(`${API_URL}${url}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return res.json();
}

/**
 * User Engagement API
 */
export const userEngagementApi = {
  favorites: {
    getMine: () => apiFetch('/api/favorites/me'),
    add: (payload) => apiFetch('/api/favorites', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    remove: (vehicleId) => apiFetch(`/api/favorites/${vehicleId}`, {
      method: 'DELETE',
    }),
    check: (vehicleId) => apiFetch(`/api/favorites/check/${vehicleId}`),
  },

  compare: {
    getMine: () => apiFetch('/api/compare/me'),
    add: (payload) => apiFetch('/api/compare/add', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    remove: (vehicleId) => apiFetch(`/api/compare/remove/${vehicleId}`, {
      method: 'DELETE',
    }),
    clear: () => apiFetch('/api/compare/clear', { method: 'DELETE' }),
    resolve: () => apiFetch('/api/compare/resolve', { method: 'POST' }),
  },

  history: {
    request: (vin) => apiFetch('/api/history/request', {
      method: 'POST',
      body: JSON.stringify({ vin }),
    }),
    getReport: (vin) => apiFetch(`/api/history/report/${vin}`),
    getQuota: () => apiFetch('/api/history/quota/me'),
  },

  intent: {
    getMyScore: () => apiFetch('/api/intent/me'),
  },
};

export default apiFetch;
