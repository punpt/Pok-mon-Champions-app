import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });

// Time com um Garchomp de verdade: Rock Slide incluso.
await ctx.addInitScript(() => {
  localStorage.setItem('champions-lab:baseUrl', 'http://localhost:4321');
  localStorage.setItem('champions-lab:teams', JSON.stringify([{
    id: 'time-teste', name: 'Teste', regulationId: 'MB', updatedAt: Date.now(),
    members: [{
      uid: 'chomp', species: 'garchomp', ability: 'Rough Skin', item: 'Life Orb',
      nature: 'Adamant', sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
      moves: ['Earthquake', 'Rock Slide', 'Dragon Claw', 'Protect'],
    }],
  }]));
});

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/#/ameacas`, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/shots/10-ameacas-corrigido.png', animations: 'disabled', timeout: 60000 });

const veredictos = await page.evaluate(() => {
  const out = [];
  for (const card of document.querySelectorAll('button')) {
    const nome = card.querySelector('span.truncate')?.textContent?.trim();
    const pills = [...card.querySelectorAll('span')]
      .map((s) => s.textContent?.trim())
      .filter((t) => t && /^(Perde feio|Desfavoravel|Equilibrado|Favoravel|Domina)$/.test(t));
    if (nome && pills.length) out.push(`${nome} -> ${pills[0]}`);
  }
  return out;
});
console.log('=== VEREDITOS COM GARCHOMP COMPLETO ===');
veredictos.forEach((v) => console.log(' ', v));
console.log('\nerros de runtime:', errors.length ? errors : 'nenhum');
await browser.close();
