const LOCAL_API_BASE = '/api/auth';
const REMOTE_API_BASE = 'https://your-render-service.onrender.com/api/auth';

const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const apiBase = isLocalhost ? LOCAL_API_BASE : REMOTE_API_BASE;
