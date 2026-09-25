import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = process.env.ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT || path.join(root, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.bin': 'application/octet-stream', '.hdr': 'application/octet-stream' };
const srv = http.createServer((q, r) => {
  const p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); });
}).listen(0);
const port = srv.address().port;
const tag = process.argv[2] || 'x';
const which = (process.argv[3] || 'front').split(',');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--in-process-gpu', '--disable-gpu-sandbox', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(`http://localhost:${port}/start.html`);
await page.waitForFunction(() => window.__GAME && window.__GAME.squad, null, { timeout: 240000 });
await page.evaluate(() => { const s = document.getElementById('start'); if (s) s.style.display = 'none'; });
const err = await page.evaluate(() => document.getElementById('err').textContent);
if (err) console.log('ERR', err.slice(0, 800));
const X = [-4.2, -1.75, 1.75, 4.2];
const views = {
  front: X.map((x, i) => ({ n: 'f' + i, from: [x, 1.30, 1.2 + 2.3], to: [x, 1.12, 1.2], fov: 40 })),
  close: X.map((x, i) => ({ n: 'c' + i, from: [x, 1.35, 1.2 + 1.35], to: [x, 1.25, 1.2], fov: 40 })),
  side: [0, 2].map((i) => ({ n: 's' + i, from: [X[i] + 2.2, 1.35, 1.2 + 0.6], to: [X[i], 1.2, 1.2], fov: 40 })),
  q34: [1, 3].map((i) => ({ n: 'q' + i, from: [X[i] - 1.5, 1.4, 1.2 + 1.9], to: [X[i], 1.2, 1.2], fov: 40 })),
  group: [{ n: 'g', from: [0, 1.4, 10.5], to: [0, 1.0, 1.2], fov: 50 }],
  top: [0, 2].map((i) => ({ n: 't' + i, from: [X[i], 3.2, 1.2 + 0.5], to: [X[i], 1.1, 1.2], fov: 45 }))
};
await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
await page.waitForTimeout(500);
for (const w of which) for (const v of (views[w] || [])) {
  const url = await page.evaluate((v) => {
    const G = window.__GAME;
    G.view(v.from, v.to, v.fov);
    G.step(40, 1 / 60);
    G.view(v.from, v.to, v.fov);
    G.step(1, 1 / 60);
    G.renderer.render(G.scene, G.camera);
    return G.renderer.domElement.toDataURL('image/png');
  }, v);
  fs.writeFileSync(`${OUT}/${tag}_${v.n}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
if (which.includes('emb')) {
  const url = await page.evaluate(() => {
    const G = window.__GAME; const T = window.THREE;
    G.embody(1); G.step(90, 1 / 60);
    const s = G.squad[1], p = s.ctrl.pos;
    const put = (off) => { G.camera.position.set(p.x + off[0], p.y + off[1], p.z + off[2]); G.camera.lookAt(p.x, p.y + 1.25, p.z); G.camera.fov = 40; G.camera.updateProjectionMatrix(); G.camera.updateMatrixWorld(); };
    const out = [];
    for (const off of [[0.6, 1.4, 2.2], [-2.0, 1.4, 0.4]]) { put(off); G.renderer.render(G.scene, G.camera); out.push(G.renderer.domElement.toDataURL('image/png')); }
    return out;
  });
  url.forEach((u, i) => fs.writeFileSync(`${OUT}/${tag}_e${i}.png`, Buffer.from(u.split(',')[1], 'base64')));
}
const gc = await page.evaluate(() => window.__GAME.gripCheck());
console.log(JSON.stringify(gc));
if (process.env.EVAL) console.log(JSON.stringify(await page.evaluate(process.env.EVAL)));
console.log(logs.slice(0, 15).join('\n'));
await browser.close(); srv.close();
