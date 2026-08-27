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
const page = await ctx.newPage();
let requests = 0;
page.on('request', (r) => { if (r.url().includes('4321')) requests++; });

const t0 = Date.now();
await page.goto(`${BASE}/#/ameacas`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=/QUEM AMEACA/i', { timeout: 60000 });
const tPrimeiro = Date.now() - t0;
await page.waitForFunction(() => !document.body.textContent?.includes('Avaliando'), { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(2500);
const tCompleto = Date.now() - t0;
console.log(`  primeiro resultado na tela: ${tPrimeiro}ms`);
console.log(`  analise completa:           ${tCompleto}ms`);
console.log(`  requisicoes a API:          ${requests}`);
await browser.close();
