// Persistencia simple en localStorage para toda la suite Gestión de Vida.
const GV_STORE = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('GV_STORE.get error', key, e);
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('GV_STORE.set error', key, e);
      return false;
    }
  },
  remove(key) {
    localStorage.removeItem(key);
  },
  uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }
};
