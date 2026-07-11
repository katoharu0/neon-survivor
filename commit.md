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

## Commit 6a4a0d98 — 2026-07-05 07:54 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
drawEnemies()のvoidFrozen処理(紫トーン変化#8f6fd9・半透明alpha0.5・紫の靄リング#b98cff)をPlaywrightのスクリーンショットで実機確認。requestAnimationFrameを凍結してからrender()を手動呼び出しする手法で、grunt(猫顔)・swift(三角)ともに紫がかった半透明表示になっていることを目視確認できた。テスト用一時PNGは削除済み。次は②通常時の雑魚敵そのものの個性・演出強化を検討する。

### This Commit's Contribution
drawSwiftFace(鋭い目+スピードライン)/drawWeaverFace(触角+蛇目)/drawTankFace(装甲鋲+十字グリル)/drawSplitterFace(ひび割れ+脈動する核)をdrawEnemies()のkind分岐に追加。実寸(r13-26)・拡大(r90)双方のスクリーンショットで4種とも判別可能なことを確認済み。残りspitter/dasher/bomber/orbiter/bruteは次バッチで対応予定。

---

## Commit 6a4a0e06 — 2026-07-05 07:55 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
drawSwiftFace(鋭い目+スピードライン)/drawWeaverFace(触角+蛇目)/drawTankFace(装甲鋲+十字グリル)/drawSplitterFace(ひび割れ+脈動する核)をdrawEnemies()のkind分岐に追加。実寸(r13-26)・拡大(r90)双方のスクリーンショットで4種とも判別可能なことを確認済み。残りspitter/dasher/bomber/orbiter/bruteは次バッチで対応予定。

### This Commit's Contribution


---

## Commit 6a4a18ee — 2026-07-05 08:42 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution
drawSpitterFace/drawDasherFace/drawBomberFace/drawOrbiterFace/drawBruteFaceの5関数を追加しdrawEnemiesに分岐を追加。Playwrightでr=90拡大・プレイヤー位置をcam追従先と一致させる手法(p.x=cam.x+W/2等)でカメラドリフトを回避しつつ全状態(spitter発射前兆/dasher通常・charge・dash/bomber通常・点火/orbiter通常・近接/brute)のスクリーンショット確認完了。これで9種の雑魚敵(grunt/swift/weaver/tank/splitter/spitter/dasher/bomber/orbiter/brute)全ての顔デザインが完了。コード変更(index.html)はまだuncommitted、ユーザーの明示指示待ち

---

## Commit 6a4a18fb — 2026-07-05 08:42 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
drawSpitterFace/drawDasherFace/drawBomberFace/drawOrbiterFace/drawBruteFaceの5関数を追加しdrawEnemiesに分岐を追加。Playwrightでr=90拡大・プレイヤー位置をcam追従先と一致させる手法(p.x=cam.x+W/2等)でカメラドリフトを回避しつつ全状態(spitter発射前兆/dasher通常・charge・dash/bomber通常・点火/orbiter通常・近接/brute)のスクリーンショット確認完了。これで9種の雑魚敵(grunt/swift/weaver/tank/splitter/spitter/dasher/bomber/orbiter/brute)全ての顔デザインが完了。コード変更(index.html)はまだuncommitted、ユーザーの明示指示待ち

### This Commit's Contribution


---

## Commit 6a4a2055 — 2026-07-05 09:13 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a4a3d0b — 2026-07-05 11:16 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a4a4b3b — 2026-07-05 12:16 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a4a5840 — 2026-07-05 13:12 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a4a5d32 — 2026-07-05 13:33 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a4b4188 — 2026-07-06 05:47 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a4b4f5a — 2026-07-06 06:46 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution
update(dt)340行を9つの意味別関数に分割（死亡時early-returnはbool戻り値で維持）、weaponDmgヘルパーで重複6箇所解消、DESPAWN_R/オーバードライブ倍率を定数化。検証：node --check構文OK、序盤プレイ正常、デモAI死亡→gameover遷移正常、godmode+warpでラスボス戦→侵食フェーズ2回→撃破→win画面まで到達、JSエラーゼロ（favicon404とAudioContext警告は既存・無害）。残: 地雷ダメージだけオーバードライブ倍率が掛からない既存の非一貫性をユーザーに報告

---

## Commit 6a4b4f8d — 2026-07-06 06:47 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
update(dt)340行を9つの意味別関数に分割（死亡時early-returnはbool戻り値で維持）、weaponDmgヘルパーで重複6箇所解消、DESPAWN_R/オーバードライブ倍率を定数化。検証：node --check構文OK、序盤プレイ正常、デモAI死亡→gameover遷移正常、godmode+warpでラスボス戦→侵食フェーズ2回→撃破→win画面まで到達、JSエラーゼロ（favicon404とAudioContext警告は既存・無害）。残: 地雷ダメージだけオーバードライブ倍率が掛からない既存の非一貫性をユーザーに報告

### This Commit's Contribution


---

## Commit 6a4b5d6c — 2026-07-06 07:46 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution
index.html:1249 の地雷爆発を weaponDmg(wm) に統一。対照実験（OFF=44/ON=57.2、比率ちょうど1.3）で実機検証済み。SPEC.md（仕様書・方針書）を新設し、CLAUDE.md に都度更新ルール・バックアップ不要ルールを追記。verify SKILL.md にダメージ対照実験のノウハウ（bolt常時発射・levelup停止対策）を追記。残タスク: コミットのみ

---

## Commit 6a4b5d97 — 2026-07-06 07:47 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
index.html:1249 の地雷爆発を weaponDmg(wm) に統一。対照実験（OFF=44/ON=57.2、比率ちょうど1.3）で実機検証済み。SPEC.md（仕様書・方針書）を新設し、CLAUDE.md に都度更新ルール・バックアップ不要ルールを追記。verify SKILL.md にダメージ対照実験のノウハウ（bolt常時発射・levelup停止対策）を追記。残タスク: コミットのみ

### This Commit's Contribution


---

## Commit 6a4b645a — 2026-07-06 08:16 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a4b6a99 — 2026-07-06 08:43 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a4b6fbd — 2026-07-06 09:05 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution
classic scriptタグでfile://互換維持。node --check構文OK、HTTP+Playwright実プレイ85秒(92キル/Lv10/エラーなし)で挙動同一を確認。SPEC.md/README/検証レシピを同時更新。ついでに未コミットだったindex.html.bak4の削除も別コミットで完了。残タスクなし

---

## Commit 6a4b6fd0 — 2026-07-06 09:05 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
classic scriptタグでfile://互換維持。node --check構文OK、HTTP+Playwright実プレイ85秒(92キル/Lv10/エラーなし)で挙動同一を確認。SPEC.md/README/検証レシピを同時更新。ついでに未コミットだったindex.html.bak4の削除も別コミットで完了。残タスクなし

### This Commit's Contribution


---

## Commit 6a4b718c — 2026-07-06 09:12 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution
従来比3.6〜4.4倍・5時点で式一致を実機確認。ジェム12個化。SPEC.md同時更新、コミット1a3825f。残タスクなし

---

## Commit 6a4b7214 — 2026-07-06 09:15 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
従来比3.6〜4.4倍・5時点で式一致を実機確認。ジェム12個化。SPEC.md同時更新、コミット1a3825f。残タスクなし

### This Commit's Contribution


---

## Commit 6a4d0b30 — 2026-07-07 14:20 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution
dasher削除/選択後2秒無敵/レベルアップ回数減&強化増/オーラ削除/フロスト範囲2倍/起爆削除/宝箱4段ラダー化/chargerボス仕様変更/無敵中黄色表示/オーバードライブ・コンボ削除/スマホ発熱対策の全項目をPlaywright MCPで実プレイ確認。副産物としてリザルト画面のgame.maxCombo未定義参照バグも発見し修正。コミット6c9600ed。

---

## Commit 6a4d0b44 — 2026-07-07 14:20 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
dasher削除/選択後2秒無敵/レベルアップ回数減&強化増/オーラ削除/フロスト範囲2倍/起爆削除/宝箱4段ラダー化/chargerボス仕様変更/無敵中黄色表示/オーバードライブ・コンボ削除/スマホ発熱対策の全項目をPlaywright MCPで実プレイ確認。副産物としてリザルト画面のgame.maxCombo未定義参照バグも発見し修正。コミット6c9600ed。

### This Commit's Contribution


---

## Commit 6a4d1600 — 2026-07-07 15:06 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a4d1bae — 2026-07-07 15:30 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution
IS_TOUCH時にCanvasRenderingContext2D.prototypeのshadowBlur setterを差し替えて常に0にする方式で、65箇所ある個別のshadowBlur設定箇所を一切変更せずに実現。PC版は従来通り影あり。実機検証(Playwright)でPC版は影が機能し、IS_TOUCH=trueを模擬したロジックでは0化されることを確認。

---

## Commit 6a4d1bb7 — 2026-07-07 15:31 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
IS_TOUCH時にCanvasRenderingContext2D.prototypeのshadowBlur setterを差し替えて常に0にする方式で、65箇所ある個別のshadowBlur設定箇所を一切変更せずに実現。PC版は従来通り影あり。実機検証(Playwright)でPC版は影が機能し、IS_TOUCH=trueを模擬したロジックでは0化されることを確認。

### This Commit's Contribution


---

## Commit 6a4d21bb — 2026-07-07 15:56 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a4d220d — 2026-07-07 15:58 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a50d3e5 — 2026-07-10 11:13 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a50d5bc — 2026-07-10 11:21 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a511837 — 2026-07-10 16:05 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a511fd0 — 2026-07-10 16:37 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a51bd37 — 2026-07-11 03:49 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a51bdca — 2026-07-11 03:51 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a51cc8c — 2026-07-11 04:54 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a51cd84 — 2026-07-11 04:58 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a51d28d — 2026-07-11 05:20 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a51d9d1 — 2026-07-11 05:51 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a51dd04 — 2026-07-11 06:04 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a51e34d — 2026-07-11 06:31 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a51e363 — 2026-07-11 06:32 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a521468 — 2026-07-11 10:01 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution
e(回復ハート静止表示)の動的実機検証を実施。healthOrbを手動生成しpickupRange=0で吸引を無効化した状態で800ms経過を観察、x/y/r/vx/vyが完全に不変であることを数値比較で確認。加えてスクリーンショットで♥アイコンの描画も確認。これによりd,e,hを含むタスクC全8項目の実機検証が完了。次はユーザーへの報告とコミット判断待ち。

---

## Commit 6a521480 — 2026-07-11 10:01 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary
e(回復ハート静止表示)の動的実機検証を実施。healthOrbを手動生成しpickupRange=0で吸引を無効化した状態で800ms経過を観察、x/y/r/vx/vyが完全に不変であることを数値比較で確認。加えてスクリーンショットで♥アイコンの描画も確認。これによりd,e,hを含むタスクC全8項目の実機検証が完了。次はユーザーへの報告とコミット判断待ち。

### This Commit's Contribution


---

## Commit 6a521534 — 2026-07-11 10:04 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a522322 — 2026-07-11 11:04 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

## Commit 6a5224a7 — 2026-07-11 11:10 UTC

### Branch Purpose
Primary development branch

### Previous Progress Summary


### This Commit's Contribution


---

