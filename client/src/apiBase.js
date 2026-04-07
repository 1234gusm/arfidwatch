const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost'
    ? 'http://localhost:4000'
    : 'https://arfidwatch.onrender.com');

export default API_BASE;
