import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
await ctx.addInitScript(() => {
  localStorage.setItem('champions-lab:baseUrl', 'http://localhost:4321');
  localStorage.setItem('champions-lab:teams', JSON.stringify([{
    id: 't', name: 'T', regulationId: 'MB', updatedAt: Date.now(),
    members: [{ uid: 'c', species: 'garchomp', ability: 'Rough Skin', item: 'Life Orb',
      nature: 'Adamant', sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
      moves: ['Earthquake', 'Rock Slide', 'Dragon Claw', 'Protect'] }],
  }]));
});

async function medir(page, rotulo) {
  let reqs = 0;
  const onReq = (r) => { if (r.url().includes('/api/battle/')) reqs++; };
  page.on('request', onReq);
  const t0 = Date.now();
  await page.goto(`${BASE}/#/ameacas`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=/QUEM AMEACA/i', { timeout: 60000 });
  const primeiro = Date.now() - t0;
  // Espera o trabalho realmente acabar: spinner sumido e estavel por 300ms.
  await page.waitForFunction(() => !document.body.textContent?.includes('Avaliando'), { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !document.body.textContent?.includes('Avaliando'), { timeout: 90000 }).catch(() => {});
  console.log(`  ${rotulo}: primeiro ${primeiro}ms · completo ${Date.now() - t0}ms · ${reqs} requests de detalhe`);
  page.off('request', onReq);
}

// Mesmo contexto = mesmo IndexedDB, como acontece de verdade ao reabrir o app.
const p1 = await ctx.newPage();
await medir(p1, 'primeira abertura ');
await p1.close();
const p2 = await ctx.newPage();
await medir(p2, 'reabrindo o app   ');
await p2.close();
await browser.close();
