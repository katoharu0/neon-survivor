---
name: verify
description: Neon Survivor（単一ファイルHTML5ゲーム）の動作検証レシピ。ビルド不要・Playwright＋URLパラメータで実プレイを観察する。
---

# Neon Survivor 検証レシピ

単一ファイル（index.html）のcanvasゲーム。ビルド・依存なし。検証は「実際に動かして観察」で行う。

## 構文チェック（最初の1分）

`<script>` の中身を抜き出して node に読ませる：

```bash
sed -n '/<script>/,/<\/script>/p' index.html | sed '1d;$d' > "$SCRATCHPAD/game.js"
node --check "$SCRATCHPAD/game.js"   # 「構文OK」ならエラーなし
```

## 起動

`file://` はPlaywright MCPでブロックされるので、ローカルHTTPサーバーを立てる：

```bash
python3 -m http.server 8642 --bind 127.0.0.1   # バックグラウンド実行
# 終わったら: pkill -f "http.server 8642"
```

## URLパラメータ（ゲーム組み込みのテスト用フック）

`http://127.0.0.1:8642/index.html?autostart=1&demo=1&fast=4&warp=535&godmode=1`

- `autostart=1` … タイトル画面をスキップして即開始
- `demo=1` … AIが自動プレイ（レベルアップ選択も自動）
- `fast=N` … ゲーム内時間をN倍速で進める
- `warp=秒` … 読み込み時に指定秒数ぶんを一気にシミュレート
- `godmode=1` … 無敵（ボス到達の検証に必須。demo AIはwarp中に死ぬことがある）
- `stats=1` … 統計オーバーレイ

ラスボスは `CLEAR_TIME = 540` 秒で出現。`warp=535&fast=4&godmode=1` でボス戦に数十秒で到達できる。

## 状態の読み取り（browser_evaluate）

**注意：** `game` と `state` はトップレベル `let` なので `window.game` では取れない
（`window.game` は `id="game"` のcanvas要素を拾ってしまう）。素の識別子で参照する：

```js
() => ({
  state: state,                       // 'title'|'playing'|'gameover'|'win'|…
  time: game.time.toFixed(1),
  hp: Math.round(game.player.hp) + "/" + game.player.maxHp,
  boss: game.enemies.filter(e => e.boss).map(e => Math.round(e.hp)),  // ボスフラグは e.boss
  voidPhase: !!game.voidPhase,        // ラスボスの侵食フェーズ（HP65%/35%で発動、6.5秒）
  errVisible: document.getElementById('err').style.display  // JSエラーはページ内 #err に出る
})
```

発動待ちは async 関数でページ内ポーリングが確実（fast=4だとフェーズは実時間約1.6秒で終わる）。

## ダメージの対照実験（browser_evaluate）

特定の武器のダメージを正確に測るときの落とし穴：

- **boltはlv判定なしで常時発射される**（初期装備のため）。`p.weapons.bolt.cd = 9999` で凍結し、
  飛行中の弾の混入を防ぐため `game.bullets.length = 0` もクリアする。
- **雑魚が死ぬとlevelup画面で止まる**（stateが'levelup'になり更新が停止）。
  `p.xp = 0; p.xpNext = 1e9; state = 'playing'` で封じてから計測する。
- 乱数要素の排除: `p.critChance = 0; p.berserkLv = 0`。的は `spawnEnemy('brute', {x, y})` で置き、
  `e.hp = e.maxHp = 100000; e.speed = 0` にすると動かない頑丈な的になる。
- 地雷は `game.mines.push({ x, y, arm: 0, r: 10 })` で敵の真上に置けば次フレームで起爆する。
- 爆発・ノヴァの衝撃波は `hitSet` で敵1体1回だけ、渡した dmg をそのまま与える（減衰なし）
  → HP減少量を期待値と直接比較できる。

## 既知の無害なコンソール出力

- `favicon.ico` 404 エラー（1件）
- `AudioContext was not allowed to start` 警告（大量）… ヘッドレスでユーザー操作がないため。実プレイでは出ない

これ以外のエラーが出たら本物のバグ。

## 後片付け

ブラウザを閉じる → `pkill -f "http.server 8642"` → スクリーンショットは
リポジトリ直下に保存されるので scratchpad へ移動（コミットに混ぜない）。
