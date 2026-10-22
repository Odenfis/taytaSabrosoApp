import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
function environment(stored: string | null = null, systemDark = false, storageFails = false) {
  const events: Record<string, (event: any) => void> = {};
  const mediaListeners = new Set<() => void>();
  const classes = new Set<string>();
  const frames: (() => void)[] = [];
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: '' }, classList: { toggle() {}, add(name: string) { classes.add(name); }, remove(name: string) { classes.delete(name); } } };
  const writes: [string, string][] = [];
  const media = { matches: systemDark, addEventListener(_type: string, cb: () => void) { mediaListeners.add(cb); }, removeEventListener(_type: string, cb: () => void) { mediaListeners.delete(cb); } };
  const host: any = { requestAnimationFrame: (callback: () => void) => frames.push(callback), document: { documentElement: root }, localStorage: { getItem() { if (storageFails) throw Error('blocked'); return stored; }, setItem(key: string, value: string) { if (storageFails) throw Error('blocked'); writes.push([key, value]); stored = value; } }, matchMedia: () => media, addEventListener(type: string, cb: (event: any) => void) { events[type] = cb; } };
  runInNewContext(source, { window: host });
  return { store: host.TaytaTheme, root, writes, classes, frames, events, mediaListeners, changeSystem(dark: boolean) { media.matches = dark; mediaListeners.forEach(cb => cb()); } };
}
test('bootstrap aplica preferencia antes de React, oscuro por defecto y ante valor inválido', () => {
  for (const value of [null, 'invalid', 'dark']) assert.equal(environment(value).root.dataset.theme, 'dark');
  assert.equal(environment('light').root.dataset.theme, 'light');
  assert.equal(environment('system', true).root.style.colorScheme, 'dark');
  assert.equal(environment('system', false).root.style.colorScheme, 'light');
});
test('persistencia y notificación sin operaciones del POS; snapshot estable', () => {
  const e = environment(); let calls = 0;
  const unsubscribe = e.store.subscribe(() => calls++);
  const first = e.store.getSnapshot(); assert.equal(e.store.getSnapshot(), first);
  e.store.setPreference('light');
  assert.equal(calls, 1); assert.deepEqual(e.writes, [['ts_ui_theme_v1', 'light']]);
  assert.equal(e.root.dataset.theme, 'light');
  e.store.setPreference('light'); assert.equal(calls, 1);
  assert.equal(environment(e.writes[0][1]).store.getSnapshot().resolved, 'light');
  unsubscribe(); e.store.setPreference('dark'); assert.equal(calls, 1);
});
test('sistema escucha solo en modo automático y se actualiza sin recargar', () => {
  const e = environment('system'); assert.equal(e.mediaListeners.size, 1);
  e.changeSystem(true); assert.equal(e.store.getSnapshot().resolved, 'dark');
  e.store.setPreference('light'); assert.equal(e.mediaListeners.size, 0);
  e.changeSystem(true); assert.equal(e.root.dataset.theme, 'light');
  e.store.setPreference('system'); assert.equal(e.mediaListeners.size, 1);
  assert.equal(e.root.dataset.theme, 'dark');
});
test('storage entre pestañas, borrado e invalidación; otras claves no afectan tema', () => {
  const e = environment('light');
  e.events.storage({ key: 'ts_pending_queue_v2', newValue: 'anything' }); assert.equal(e.root.dataset.theme, 'light');
  e.events.storage({ key: 'ts_ui_theme_v1', newValue: 'dark' }); assert.equal(e.root.dataset.theme, 'dark');
  e.events.storage({ key: 'ts_ui_theme_v1', newValue: 'system' }); assert.equal(e.root.dataset.theme, 'light');
  e.events.storage({ key: null, newValue: null }); assert.equal(e.root.dataset.theme, 'dark');
  assert.equal(e.writes.length, 0);
});
test('storage bloqueado conserva preferencia en memoria y no rompe arranque', () => {
  const e = environment(null, false, true);
  e.store.setPreference('light'); assert.equal(e.root.dataset.theme, 'light');
});
test('el cambio de tema evita transiciones mixtas y conserva el nodo raíz', () => {
  const e = environment(); const root = e.root;
  e.store.setPreference('light');
  assert.equal(e.root, root); assert.equal(e.classes.has('theme-changing'), true);
  e.frames.shift()!(); e.frames.shift()!();
  assert.equal(e.classes.has('theme-changing'), false);
});
test('pantallas sin colores directos fuera del papel; colores de impresión conservados', () => {
  const dir = new URL('../src/components/', import.meta.url);
  for (const name of readdirSync(dir).filter(n => n.endsWith('.tsx'))) {
    let text = readFileSync(new URL(name, dir), 'utf8');
    if (name === 'ReceiptModal.tsx') text = text.replace(/\{\/\* Printable Ticket Receipt Paper Design \*\/\}[\s\S]*?(?=\{\/\* Footer)/, '');
    if (name === 'PrinterTestModal.tsx') text = text.replace(/<div className="w-full max-w-\[320px\][\s\S]*?(?=\{\/\* Footer)/, '');
    assert.doesNotMatch(text, /(?:bg|text|border|ring|from|to|via)-\[#[\da-fA-F]+\]/, name);
    assert.doesNotMatch(text, /(?:bg|text|border)-(?:white|black|(?:rose|emerald|amber|blue|zinc)-\d+)/, name);
  }
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /@media print/); assert.match(css, /width: 80mm/); assert.match(css, /background: #fff !important/);
});

test('paleta clara: contraste de textos y controles principales', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const light = Object.fromEntries([...css.matchAll(/:root\[data-theme="light"\]\s*\{([^}]+)\}/g)].flatMap(block => [...block[1].matchAll(/--color-([\w-]+):\s*(#[\da-fA-F]{3,6});/g)].map(m => [m[1], m[2]])));
  const lum = (hex: string) => {
    let h = hex.slice(1); if (h.length === 3) h = [...h].map(c => c + c).join('');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  };
  const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
  for (const token of ['on-surface', 'on-surface-variant', 'primary', 'secondary', 'tertiary', 'error']) {
    for (const bg of [light.background, '#ffffff']) assert.ok(ratio(light[token], bg) >= 4.5, token);
  }
  assert.ok(ratio('#ffdbcd', light['primary-container']) >= 4.5);
  assert.ok(ratio(light.outline, '#ffffff') >= 3);
});
