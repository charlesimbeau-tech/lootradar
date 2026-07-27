(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LootRadarRedirect = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/;
  const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

  function validatePath(value) {
    if (typeof value !== 'string' || !value || value !== value.trim()) return null;

    let decoded;
    try {
      decoded = decodeURIComponent(value);
    } catch (_) {
      return null;
    }

    if (!decoded || CONTROL_CHARACTERS.test(decoded) || decoded.includes('\\')) return null;
    if (SCHEME.test(decoded)) return null;
    if (decoded.charAt(0) !== '/' || decoded.charAt(1) === '/') return null;

    return decoded;
  }

  function safeRedirect(value, fallback) {
    const safeFallback = validatePath(fallback) || '/';
    return validatePath(value) || safeFallback;
  }

  return { safeRedirect };
});
