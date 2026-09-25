# Визуальная проверка бойцов

`render-check.mjs` поднимает `start.html` в headless Chromium (SwiftShader),
ставит камеру через `__GAME.view` и сохраняет кадры в `shots/`, а в консоль
печатает `__GAME.gripCheck()`: расстояние кистей до точек хвата, углы в локтях,
отведение плеч (`abductR/L`), вынос локтей (`elbowOutR/L`) и наклон ствола.

```sh
npm i playwright && npx playwright install --with-deps chromium
node tools/render-check.mjs <тег> front,close,side,q34,group,top,emb
```

Ассеты бойца берутся с jsDelivr, если рядом нет `assets/`.
