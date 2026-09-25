/* Визуальная и геометрическая проверка бойцов.

   node tools/render-check.mjs [папка для кадров]

   Поднимает start.html в headless Chromium (SwiftShader), снимает бойцов
   спереди в кадре как у референса, в 3/4 и в профиль, затем берёт бойца
   под управление и снимает прицел. Печатает gripCheck/sightCheck и
   завершается с кодом 1, если руки прижаты к корпусу, кисти не на
   оружии или пальцы поднимаются к прицельной линии. */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.env.ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.resolve(process.argv[2] || process.env.OUT || path.join(ROOT, 'shots'));
fs.mkdirSync(OUT, { recursive: true });

const srv = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200); r.end(d); });
}).listen(0);

/* SwiftShader в одном процессе: иначе headless не создаёт WebGL2 */
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--in-process-gpu', '--disable-gpu-sandbox', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${srv.address().port}/start.html`);
await page.waitForFunction(() => (window.__GAME && window.__GAME.squad) || document.getElementById('err').textContent, null, { timeout: 400000 });
const err = await page.evaluate(() => document.getElementById('err').textContent);
if (err) { console.error(err); process.exit(1); }

/* Кадры рисуем сами: непрерывный цикл requestAnimationFrame в SwiftShader
   не даёт странице простаивать, и штатный скриншот не дожидается кадра. */
await page.evaluate(() => {
  document.getElementById('start').style.display = 'none';
  window.requestAnimationFrame = () => 0;
  const G = window.__GAME;
  window.__shot = (from, to, fov, w, h, steps) => {
    if (from) G.view(from, to, fov);
    G.step(steps, 1 / 60);
    if (from) { G.view(from, to, fov); G.step(1, 1 / 60); }
    G.renderer.setSize(w, h, false);
    G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
    G.renderer.render(G.scene, G.camera);
    return G.renderer.domElement.toDataURL('image/png');
  };
});
const save = (name, url) => fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
const X = [-4.2, -1.75, 1.75, 4.2], Z = 1.2;

/* 1. строй «на ремне» */
const views = [];
X.forEach((x, i) => views.push([`front${i}`, [x, 1.25, Z + 6.0], [x, 1.19, Z], 13.2, 330, 700]));
views.push(['q34_left', [X[0] - 2.6, 1.4, Z + 2.6], [X[0], 1.2, Z], 22, 420, 640]);
views.push(['q34_right', [X[3] + 2.6, 1.4, Z + 2.6], [X[3], 1.2, Z], 22, 420, 640]);
views.push(['side_left', [X[0] - 3.8, 1.3, Z], [X[0], 1.2, Z], 22, 420, 640]);
views.push(['side_right', [X[3] + 3.8, 1.3, Z], [X[3], 1.2, Z], 22, 420, 640]);
views.push(['squad', [0, 1.4, 10.5], [0, 1.0, Z], 45, 1100, 620]);
let first = true;
for (const [name, from, to, fov, w, h] of views) {
  save(name, await page.evaluate((a) => window.__shot(...a), [from, to, fov, w, h, first ? 40 : 3]));
  first = false;
}
const grip = await page.evaluate(() => window.__GAME.gripCheck());

/* 2. прицел: боец под управлением, ПКМ зажата */
await page.evaluate(() => { const G = window.__GAME; G.embody(1); G.setInput({ lock: true, ads: true }); });
save('ads', await page.evaluate(() => window.__shot(null, null, 0, 1185, 662, 90)));
const sight = await page.evaluate(() => window.__GAME.sightCheck());
await page.evaluate(() => window.__GAME.setInput({ ads: false }));
save('hip', await page.evaluate(() => window.__shot(null, null, 0, 1185, 662, 60)));

/* 3. проверки */
const fails = [];
for (const g of grip) {
  console.log(JSON.stringify(g));
  if (g.palmR > 0.04 || g.palmL > 0.04) fails.push(`${g.key}: кисть не на оружии (${g.palmR}/${g.palmL})`);
  if (g.key === 'delta_2') continue;                       // этот боец под управлением, у него стойка
  if (g.abductR < 8 || g.abductL < 8) fails.push(`${g.key}: плечо прижато к корпусу (${g.abductR}°/${g.abductL}°)`);
  if (g.elbowOutR < 0.25 || g.elbowOutL < 0.25) fails.push(`${g.key}: локоть внутри контура жилета (${g.elbowOutR}/${g.elbowOutL} м)`);
}
console.log('sight', JSON.stringify(sight));
if (!sight || sight.ads < 0.95 || sight.clearance < 0.01) fails.push(`прицел: пальцы у прицельной линии (${JSON.stringify(sight)})`);
if (errors.length) fails.push('ошибки страницы: ' + errors.slice(0, 3).join(' | '));
console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'PASS', '\nкадры:', OUT);
await browser.close(); srv.close();
process.exit(fails.length ? 1 : 0);
