import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('champions-lab:baseUrl', 'http://localhost:4321');
});
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));

// Time vazio: adicionar pelo picker deve trazer o set do ladder pronto.
await page.goto(`${BASE}/#/time`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.getByText(/Adicionar Pokemon/i).click();
await page.waitForTimeout(600);
await page.getByPlaceholder('Buscar...').fill('Garchomp');
await page.waitForTimeout(500);
await page.locator('.fixed.inset-0 button', { hasText: 'Garchomp' }).first().click();
await page.waitForTimeout(2500);
await page.locator('button').filter({ hasText: 'Garchomp' }).first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/shots/11-set-preenchido.png', animations: 'disabled', timeout: 60000 });

const preenchido = await page.evaluate(() => document.body.innerText.slice(0, 1200));
console.log('=== SET APOS ADICIONAR (deve vir do ladder) ===');
console.log(preenchido.split('\n').filter((l) => l.trim()).slice(0, 22).join('\n'));

await page.goto(`${BASE}/#/calc`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /^Atacante/ }).click();
await page.waitForTimeout(600);
await page.getByPlaceholder('Buscar...').fill('Garchomp');
await page.waitForTimeout(500);
await page.locator('.fixed.inset-0 button', { hasText: 'Garchomp' }).first().click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /^Defensor/ }).click();
await page.waitForTimeout(600);
await page.getByPlaceholder('Buscar...').fill('Sinistcha');
await page.waitForTimeout(500);
await page.locator('.fixed.inset-0 button', { hasText: 'Sinistcha' }).first().click();
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/shots/12-calc-golpes.png', animations: 'disabled', timeout: 60000 });

await page.goto(`${BASE}/#/ajustes`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/shots/13-ajustes-usage.png', animations: 'disabled', timeout: 60000 });

console.log('\nerros de runtime:', erros.length ? erros : 'nenhum');
await browser.close();
