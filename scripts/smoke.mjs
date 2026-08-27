import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:5173';
const errors = [];
const shots = [];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

// Aponta o app para a API local antes do primeiro render.
await ctx.addInitScript(() => {
  localStorage.setItem('champions-lab:baseUrl', 'http://localhost:4321');
});

async function shot(name, waitFor) {
  if (waitFor) {
    try { await page.waitForSelector(waitFor, { timeout: 12000 }); }
    catch { errors.push(`[timeout] "${waitFor}" nao apareceu em ${name}`); }
  }
  await page.waitForTimeout(1500);
  const p = `/tmp/shots/${name}.png`;
  // fullPage numa pagina muito alta com spinner animado trava o screenshot.
  await page.screenshot({ path: p, animations: 'disabled', timeout: 60000 });
  shots.push(p);
  console.log(`  ✓ ${name}`);
}

console.log('1. Abrindo o app...');
await page.goto(`${BASE}/#/time`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await shot('01-time-vazio');

console.log('2. Adicionando Garchomp...');
await page.getByText(/Adicionar Pokemon/i).click();
await page.waitForTimeout(600);
await page.getByPlaceholder('Buscar...').fill('Garchomp');
await page.waitForTimeout(500);
await page.locator('button', { hasText: 'Garchomp' }).first().click();
await shot('02-garchomp-no-time');

console.log('3. Abrindo o editor do set...');
await page.locator('button').filter({ hasText: 'Garchomp' }).first().click();
await page.waitForTimeout(2000);
await shot('03-editor-set');

console.log('4. Ameacas ao Garchomp...');
await page.goto(`${BASE}/#/ameacas`, { waitUntil: 'networkidle' });
await shot('04-ameacas', 'text=/Quem ameaca/i');

console.log('5. Sinergias...');
await page.goto(`${BASE}/#/sinergia/basculegion`, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await shot('05-sinergia-basculegion');

console.log('6. Bons contra...');
await page.getByText('Bons CONTRA ele').click();
await shot('06-sinergia-contra');

console.log('7. Dex...');
await page.goto(`${BASE}/#/dex`, { waitUntil: 'networkidle' });
await shot('07-dex');

console.log('8. Calculadora...');
await page.goto(`${BASE}/#/calc`, { waitUntil: 'networkidle' });
await shot('08-calc');

console.log('9. Ajustes...');
await page.goto(`${BASE}/#/ajustes`, { waitUntil: 'networkidle' });
await shot('09-ajustes');

await browser.close();

console.log('\n=== ERROS DE RUNTIME ===');
if (!errors.length) console.log('nenhum');
else errors.forEach((e) => console.log(' -', e));
console.log('\nscreenshots:', shots.length);
