import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:5173';
const erros = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => localStorage.setItem('champions-lab:baseUrl', 'http://localhost:4321'));
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));

async function escolher(rotulo, nome) {
  await page.getByRole('button', { name: new RegExp(`^${rotulo}`) }).first().click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('Buscar...').fill(nome);
  await page.waitForTimeout(500);
  await page.locator('.fixed.inset-0 button', { hasText: nome }).first().click();
  await page.waitForTimeout(2200);
}

console.log('montando time...');
await page.goto(`${BASE}/#/time`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
for (const mon of ['Garchomp', 'Whimsicott', 'Kingambit']) {
  await escolher('Adicionar Pokemon', mon);
  console.log(`  + ${mon}`);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/shots/20-time.png', animations: 'disabled', fullPage: true, timeout: 60000 });

const texto = await page.evaluate(() => document.body.innerText);
console.log('\n--- resumos de cobertura ---');
for (const l of texto.split('\n')) {
  if (/super efetiv|empilhada|Fraco a|resistencia/i.test(l)) console.log('  ' + l.trim());
}

console.log('\nabrindo editor do Kingambit...');
await page.locator('button', { hasText: 'Kingambit' }).first().click();
await page.waitForTimeout(2500);
const temSucker = await page.evaluate(async () => {
  const botoes = [...document.querySelectorAll('button')];
  const golpe = botoes.find((b) => /GOLPE 1/i.test(b.textContent || ''));
  if (!golpe) return 'sem seletor de golpe';
  golpe.click();
  await new Promise((r) => setTimeout(r, 700));
  const busca = document.querySelector('input[placeholder="Buscar..."]');
  if (!busca) return 'sem campo de busca';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(busca, 'Sucker');
  busca.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 700));
  return document.body.innerText.includes('Sucker Punch') ? 'SIM' : 'NAO';
});
console.log(`  Sucker Punch aparece no Kingambit: ${temSucker}`);
await page.screenshot({ path: '/tmp/shots/21-sucker.png', animations: 'disabled', timeout: 60000 });

console.log('\nerros de runtime:', erros.length ? erros : 'nenhum');
await browser.close();
