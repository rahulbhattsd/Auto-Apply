// Fallback just in case env is not injected properly by vite
const API_BASE = import.meta.env.VITE_API_URL;
export const fetchApi = async (endpoint, options = {}) => {
    const isFormData = options.body instanceof FormData;
    const headers = new Headers(options.headers);
    if (!isFormData && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || error.message || 'API request failed');
    }
    return response.json();
};
