const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname.includes('github.io')
    ? 'https://arfidwatch.onrender.com'
    : 'http://localhost:4000');

export default API_BASE;
