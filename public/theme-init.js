/* Runs before the first paint. This store is shared with React; it never touches POS data. */
(function (host) {
  'use strict';
  const key = 'ts_ui_theme_v1';
  const normalize = value => ['light', 'dark', 'system'].includes(value) ? value : 'dark';
  const listeners = new Set();
  let media;
  let preference = 'dark';
  try { preference = normalize(host.localStorage.getItem(key)); } catch (_) { /* Memory-only preference. */ }
  let snapshot;
  function apply() {
    const resolved = preference === 'system' ? (media && media.matches ? 'dark' : 'light') : preference;
    const root = host.document.documentElement;
    if (snapshot && snapshot.resolved !== resolved && host.requestAnimationFrame) {
      root.classList.add('theme-changing');
      host.requestAnimationFrame(() => host.requestAnimationFrame(() => root.classList.remove('theme-changing')));
    }
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    root.classList.toggle('dark', resolved === 'dark');
    if (snapshot && snapshot.preference === preference && snapshot.resolved === resolved) return;
    snapshot = Object.freeze({ preference, resolved });
    listeners.forEach(listener => listener());
  }
  function watchSystem() {
    if (media) media.removeEventListener('change', apply);
    media = undefined;
    if (preference === 'system' && host.matchMedia) {
      media = host.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', apply);
    }
    apply();
  }
  host.TaytaTheme = {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    setPreference: value => {
      preference = normalize(value);
      try { host.localStorage.setItem(key, preference); } catch (_) { /* Keep operating without storage. */ }
      watchSystem();
    },
  };
  host.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = normalize(event.newValue);
    watchSystem();
  });
  watchSystem();
})(window);
