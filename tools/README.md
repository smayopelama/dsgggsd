# Проверка бойцов

`render-check.mjs` поднимает `start.html` в headless Chromium (SwiftShader),
снимает бойцов в строю (спереди в кадре как у референса, в 3/4, в профиль),
затем берёт бойца под управление и снимает прицел и положение от бедра.

Проверки (код выхода 1 при провале):
- кисти на рукоятке и цевье (`gripCheck().palmR/palmL` < 4 см);
- в строю плечи отведены от корпуса (`abductR/L` ≥ 8°), локти вне контура
  жилета (`elbowOutR/L` ≥ 0,25 м от оси груди);
- в прицеле левая перчатка ниже прицельной линии минимум на 1 см
  (`sightCheck().clearance`).

```sh
npm i playwright && npx playwright install --with-deps chromium
node tools/render-check.mjs shots
```

Ассеты бойца берутся из `assets/` рядом со `start.html`, иначе с jsDelivr.
