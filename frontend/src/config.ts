// Configuration for backend connection
// Automatically detects if running locally or on remote server

const getBackendUrl = (): string => {
  // Allow override via environment variable (for testing)
  if (import.meta.env.VITE_BACKEND_WS_URL) {
    return import.meta.env.VITE_BACKEND_WS_URL;
  }

  // Check if we're in development (localhost) or production
  const hostname = window.location.hostname;

  // If running on localhost, use localhost backend
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'ws://localhost:3003';
  }

  // Otherwise, use the same hostname with port 3003
  // For Lightsail: ws://44.203.227.35:3003
  // For any other domain: ws://yourdomain.com:3003
  return `ws://${hostname}:3003`;
};

export const BACKEND_WS_URL = getBackendUrl();
export const BACKEND_HTTP_URL = BACKEND_WS_URL.replace(
  'ws://',
  'http://'
).replace('wss://', 'https://');
