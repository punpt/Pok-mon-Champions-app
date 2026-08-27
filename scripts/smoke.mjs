import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5173';
const erros = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => localStorage.setItem('champions-lab:baseUrl', 'http://localhost:4321'));
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));

console.log('montando time pela grade...');
await page.goto(`${BASE}/#/time`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
for (const mon of ['Garchomp', 'Whimsicott', 'Kingambit']) {
  await page.locator('button', { hasText: 'Adicionar' }).first().click();
  await page.waitForTimeout(700);
  await page.getByPlaceholder('Buscar...').fill(mon);
  await page.waitForTimeout(500);
  await page.locator('.fixed.inset-0 button', { hasText: mon }).first().click();
  await page.waitForTimeout(2000);
  console.log(`  + ${mon}`);
}
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/shots/40-time-grade.png', animations: 'disabled', fullPage: true, timeout: 60000 });

console.log('\nselecionando o Kingambit e abrindo o editor...');
await page.locator('button').filter({ hasText: /^Kingambit/ }).first().click();
await page.waitForTimeout(900);
await page.getByRole('button', { name: /Editar set/ }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/shots/41-editor.png', animations: 'disabled', fullPage: true, timeout: 60000 });

console.log('abrindo a tabela de golpes...');
await page.locator('button', { hasText: 'Golpe 1' }).first().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/shots/42-tabela-golpes.png', animations: 'disabled', timeout: 60000 });
const resumo = await page.evaluate(() => {
  const t = document.body.innerText;
  const linha = t.split('\n').find((l) => /de \d+ golpes/.test(l));
  return linha || 'sem contador';
});
console.log('  ' + resumo);
// Testa o filtro por tipo dentro da tabela.
await page.locator('.fixed.inset-0 button', { hasText: /^Steel$/ }).first().click();
await page.waitForTimeout(800);
const filtrado = await page.evaluate(() => {
  const t = document.body.innerText;
  return t.split('\n').find((l) => /de \d+ golpes/.test(l)) || '';
});
console.log('  apos filtrar Steel: ' + filtrado);
await page.screenshot({ path: '/tmp/shots/43-golpes-filtrados.png', animations: 'disabled', timeout: 60000 });
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

console.log('\nDex com filtros...');
await page.goto(`${BASE}/#/dex`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/shots/44-dex.png', animations: 'disabled', timeout: 60000 });

console.log('\nerros de runtime:', erros.length ? erros : 'nenhum');
await browser.close();
