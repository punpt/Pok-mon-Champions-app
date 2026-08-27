import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5173';
const erros = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => localStorage.setItem('champions-lab:baseUrl', 'http://localhost:4321'));
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(e.message));

async function escolher(rotulo, nome) {
  await page.getByRole('button', { name: new RegExp(`^${rotulo}`) }).first().click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('Buscar...').fill(nome);
  await page.waitForTimeout(500);
  await page.locator('.fixed.inset-0 button', { hasText: nome }).first().click();
  await page.waitForTimeout(1800);
}

await page.goto(`${BASE}/#/calc`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await escolher('Atacante', 'Kingambit');
await escolher('Defensor', 'Basculegion');
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/shots/30-calc-sp.png', animations: 'disabled', fullPage: true, timeout: 60000 });

// Confere a ordem do seletor de golpes do Kingambit.
const ordem = await page.evaluate(async () => {
  const b = [...document.querySelectorAll('button')].find((x) => /GOLPE 1/i.test(x.textContent || ''));
  if (!b) return ['sem seletor'];
  b.click();
  await new Promise((r) => setTimeout(r, 800));
  return [...document.querySelectorAll('.fixed.inset-0 button')]
    .map((x) => (x.textContent || '').trim().split('\n')[0])
    .filter((t) => t && t !== 'Fechar' && t !== 'Vazio')
    .slice(0, 8);
});
console.log('primeiros golpes oferecidos ao Kingambit:');
ordem.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
console.log('\nerros de runtime:', erros.length ? erros : 'nenhum');
await browser.close();
