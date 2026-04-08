const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost'
    ? 'http://localhost:4000'
    : '');  // same-origin when served from Render

export default API_BASE;
