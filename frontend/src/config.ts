// Configuration for backend connection
// Uses hostname only (not the frontend port), so the app works whether the dev server
// is on 3000, 3001, etc. Backend port is 3003 by default or from env.

const getBackendUrl = (): string => {
  // Full override (e.g. ws://localhost:3004 if backend is on 3004)
  if (import.meta.env.VITE_BACKEND_WS_URL) {
    return import.meta.env.VITE_BACKEND_WS_URL;
  }

  const hostname = window.location.hostname;
  // Optional port override when backend runs on a different port (e.g. PORT=3004)
  const port =
    import.meta.env.VITE_BACKEND_PORT ?? '3003';

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `ws://localhost:${port}`;
  }

  return `ws://${hostname}:${port}`;
};

export const BACKEND_WS_URL = getBackendUrl();
export const BACKEND_HTTP_URL = BACKEND_WS_URL.replace(
  'ws://',
  'http://'
).replace('wss://', 'https://');
