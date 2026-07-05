# Branch: main

**Purpose:** Primary development branch

_Commits will be appended below._

## Commit 6a44e008 — 2026-07-01 09:38 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution
ボスHP削減・sweepMobs廃止・ボス速度増加・モブ調整・HUD拡大・視認性向上を実装してコミット・push済み

---

## Commit 6a4680f2 — 2026-07-02 15:17 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
ボスHP削減・sweepMobs廃止・ボス速度増加・モブ調整・HUD拡大・視認性向上を実装してコミット・push済み

### This Commit's Contribution
godmodeデモ8回でXP収入中央値~4.3kを実測。人間収入推定3-3.5万から係数0.15を算出。ユーザーの実プレイで最終確認待ち

---

## Commit 6a47f1f2 — 2026-07-03 17:31 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
godmodeデモ8回でXP収入中央値~4.3kを実測。人間収入推定3-3.5万から係数0.15を算出。ユーザーの実プレイで最終確認待ち

### This Commit's Contribution
残課題: wave3突入(t=180-210)への死亡集中。demoAI 8走で勝利0/死亡中央値~198s(ただしdemoAIはランダム弱ビルドの下限目安)。次に触るならENEMY_SCHED(index.html:560付近)のwave3構成

---

## Commit 6a48e35a — 2026-07-04 10:41 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
残課題: wave3突入(t=180-210)への死亡集中。demoAI 8走で勝利0/死亡中央値~198s(ただしdemoAIはランダム弱ビルドの下限目安)。次に触るならENEMY_SCHED(index.html:560付近)のwave3構成

### This Commit's Contribution
全項目実装済み。検証: node --check構文OK / headless chromeで blinker先頭化(warp=100でblinker:1800)・コンティニュー(死亡→playing復帰・HP全快・deaths/totalDeaths=1)・宝箱フロー(初回=ダッシュorブリンク確定、カード表示→任意キー/クリックで再開、2個目は別枠)・ラスボスHP13000(lvScale込みで期待値一致)を数値確認。スクショでゲームオーバー2ボタン画面と宝箱カードの描画確認。残作業なし。push はStop hookが自動実行

---

## Commit 6a492691 — 2026-07-04 15:28 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
全項目実装済み。検証: node --check構文OK / headless chromeで blinker先頭化(warp=100でblinker:1800)・コンティニュー(死亡→playing復帰・HP全快・deaths/totalDeaths=1)・宝箱フロー(初回=ダッシュorブリンク確定、カード表示→任意キー/クリックで再開、2個目は別枠)・ラスボスHP13000(lvScale込みで期待値一致)を数値確認。スクショでゲームオーバー2ボタン画面と宝箱カードの描画確認。残作業なし。push はStop hookが自動実行

### This Commit's Contribution
SKILL_UPGRADES 5段(dash→dashInvuln→CD半減→blink→CD半減)＋6個目以降フルリペア。enemyCage包囲攻撃をspreader(交互)とoverlord(r 0.60-0.72)に追加。overlord弾dmg 30/30/24/26・ストンプ50・接触45。ヘッドレス数値検証とスクショ確認済み。残: push+Pages監視・メモリ更新

---

## Commit 6a494c91 — 2026-07-04 18:10 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
SKILL_UPGRADES 5段(dash→dashInvuln→CD半減→blink→CD半減)＋6個目以降フルリペア。enemyCage包囲攻撃をspreader(交互)とoverlord(r 0.60-0.72)に追加。overlord弾dmg 30/30/24/26・ストンプ50・接触45。ヘッドレス数値検証とスクショ確認済み。残: push+Pages監視・メモリ更新

### This Commit's Contribution
ミニボスローテをspreader/charger/bomber/blinkerに変更(charger大型r46・タメ0.9s・760px/s・CD8s、bomberは予告円9発の爆撃)。overlordは扇85/リング85/スパイラル70/包囲80/爆撃65/突進780/瞬移リング80/ストンプ100の融合技(召喚廃止)。HP1.3倍(520/16900)・接触90。touchmoveを3分岐化しレベルアップ中も移動指を保持可能に。headless検証で全42項目パス、スクショで予告円描画確認。残: push+Pages監視+メモリ更新

---

## Commit 6a49f2ff — 2026-07-05 06:00 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
ミニボスローテをspreader/charger/bomber/blinkerに変更(charger大型r46・タメ0.9s・760px/s・CD8s、bomberは予告円9発の爆撃)。overlordは扇85/リング85/スパイラル70/包囲80/爆撃65/突進780/瞬移リング80/ストンプ100の融合技(召喚廃止)。HP1.3倍(520/16900)・接触90。touchmoveを3分岐化しレベルアップ中も移動指を保持可能に。headless検証で全42項目パス、スクショで予告円描画確認。残: push+Pages監視+メモリ更新

### This Commit's Contribution


---

## Commit 6a49f313 — 2026-07-05 06:00 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a49f42e — 2026-07-05 06:05 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a49fca7 — 2026-07-05 06:41 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a4a0557 — 2026-07-05 07:18 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution
drawEnemies()のvoidFrozen処理(紫トーン変化#8f6fd9・半透明alpha0.5・紫の靄リング#b98cff)をPlaywrightのスクリーンショットで実機確認。requestAnimationFrameを凍結してからrender()を手動呼び出しする手法で、grunt(猫顔)・swift(三角)ともに紫がかった半透明表示になっていることを目視確認できた。テスト用一時PNGは削除済み。次は②通常時の雑魚敵そのものの個性・演出強化を検討する。

---

