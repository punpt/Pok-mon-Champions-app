import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
await ctx.addInitScript(() => {
  localStorage.setItem('champions-lab:baseUrl', 'http://localhost:4321');
});

const p1 = await ctx.newPage();
await p1.goto(`${BASE}/#/ameacas`, { waitUntil: 'networkidle' });
await p1.waitForTimeout(8000);

const estado = await p1.evaluate(async () => {
  const dbs = await indexedDB.databases();
  const out = { dbs: dbs.map((d) => d.name), chaves: [], tamanhos: {} };
  // idb-keyval usa o db "keyval-store", store "keyval".
  const req = indexedDB.open('keyval-store');
  const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  const tx = db.transaction('keyval', 'readonly');
  const store = tx.objectStore('keyval');
  const keys = await new Promise((res) => { const r = store.getAllKeys(); r.onsuccess = () => res(r.result); });
  out.chaves = keys.map(String);
  for (const k of keys) {
    const v = await new Promise((res) => { const r = store.get(k); r.onsuccess = () => res(r.result); });
    out.tamanhos[String(k)] = v && typeof v === 'object'
      ? (Array.isArray(v.entries) ? `snapshot com ${v.entries.length} entradas` : `${Object.keys(v).length} chaves`)
      : typeof v;
  }
  return out;
});
console.log('bancos:', estado.dbs);
console.log('chaves gravadas:');
for (const k of estado.chaves) console.log(`  ${k} -> ${estado.tamanhos[k]}`);
await browser.close();
