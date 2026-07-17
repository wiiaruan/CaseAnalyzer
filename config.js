// Frontend config
// Update this if backend is deployed to a different URL

export const CONFIG = {
  API_BASE: process.env.REACT_APP_API_BASE || 'http://localhost:5000/api',
  // For local dev: http://localhost:5000/api
  // For production: https://api.yourserver.com/api
};
