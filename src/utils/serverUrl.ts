export const getServerUrl = (): string => {
  // In development, use the local server
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://${window.location.hostname}:3000`;
  }
  
  // In production, use the same origin
  return window.location.origin;
};