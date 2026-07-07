"use strict";

/* =========================================================================
   Neon Survivor — 単一HTMLのサバイバー系アクション
   操作: WASD / 矢印キーで移動（攻撃は自動）。レベルアップで能力を3択。
   目標: 9分耐えてラスボスを倒すとクリア → エンドレスモード解放。
   一時停止: P / ステータス確認: Tab
   依存ファイルなし（効果音もコードで生成）。ダブルクリックで遊べます。
   ========================================================================= */

// ---- エラーを画面に表示（開発用） ----------------------------------------
window.onerror = function (msg, src, line, col) {
  const el = document.getElementById('err');
  el.style.display = 'block';
  el.textContent = 'エラー: ' + msg + '  (' + line + ':' + col + ')';
};

// ---- URLパラメータ（検証用の小細工） -------------------------------------
//  ?autostart=1 … タイトルを飛ばして即開始
//  ?demo=1      … プレイヤーを自動操作（戦闘の様子をスクショ確認するため）
//  ?fast=N      … 1フレームでN回ぶん時間を進める（検証用の早送り）
//  ?warp=秒     … 起動時にこの秒数ぶん即シミュレート（検証用）
//  ?stats=1     … 画面に処理負荷を表示（検証用）
const Q = new URLSearchParams(location.search);
const AUTOSTART = Q.get('autostart') === '1';
const DEMO = Q.get('demo') === '1';
const FAST = Math.max(1, parseInt(Q.get('fast') || '1', 10));
const WARP = parseFloat(Q.get('warp') || '0');
const STATS = Q.get('stats') === '1';
const GODMODE = Q.get('godmode') === '1'; // テスト用：HPが0にならない

// ---- キャンバスと座標系 ---------------------------------------------------
const W = 960, H = 600;                 // ゲーム内部の解像度（固定）
const ARENA_R = 800;                    // ステージ境界の半径（ワールド座標）
const DESPAWN_R = 1100;                 // プレイヤーからこの距離を超えた弾・地雷・オーブは片付ける
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// 高解像度ディスプレイでもくっきり描くための設定（描画バッファ）
// スマホは発熱対策として解像度上限を下げる（描くピクセル数を減らして負荷軽減・ユーザー要望）
function setupHiDPI() {
  const dpr = Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.5 : 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// スマホ/PC問わず、画面に収まる最大サイズへ（縦横比 960:600 を保ったまま）拡大縮小する
function fitCanvas() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const scale = Math.min(vw / W, vh / H);
  canvas.style.width = Math.round(W * scale) + 'px';
  canvas.style.height = Math.round(H * scale) + 'px';
}

// タッチ端末か（=スマホ操作UIを出すか）。primary ポインタが粗い＝指で操作する端末
const IS_TOUCH = matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window && !matchMedia('(pointer:fine)').matches);

// スマホでは影（shadowBlur）を丸ごと無効化する（発熱対策・ユーザー要望）。
// ctx.shadowBlur = 数値 という代入は全部で60箇所以上あるので、個別に書き換えず
// CanvasRenderingContext2D.prototype 側でsetterを差し替えて常に0にする（PC版のネオン演出は維持）
if (IS_TOUCH) {
  const shadowBlurDesc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
  Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowBlur', {
    get: shadowBlurDesc.get,
    set() { shadowBlurDesc.set.call(this, 0); },
  });
}

// 縦持ちのときは「横向きにしてね」を出す。プレイ中なら一時停止する（不意の被弾防止）
function checkOrientation() {
  const portrait = window.innerHeight > window.innerWidth;
  const show = IS_TOUCH && portrait;
  document.getElementById('rotate').classList.toggle('show', show);
  if (show && typeof state !== 'undefined' && state === 'playing') { state = 'paused'; }
}

function onResize() { setupHiDPI(); fitCanvas(); checkOrientation(); }
setupHiDPI();
fitCanvas();
addEventListener('resize', onResize);
addEventListener('orientationchange', () => setTimeout(onResize, 150));

// ---- 便利関数 -------------------------------------------------------------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
// 背景の星（固定位置・フレームごとに再生成しない）
const BG_STARS = Array.from({ length: 55 }, (_, i) => ({
  x: (i * 173.1 + (i * i) * 7.3) % W,
  y: (i * 211.7 + i * 13.1) % H,
  s: 0.5 + (i % 4) * 0.35,
  p: i * 0.73,
}));

// =========================================================================
//  ステージ進行の定数
// =========================================================================
const CLEAR_TIME = 9 * 60;    // クリアまでの時間（秒）。9分耐えるとラスボス出現（撃破まで入れて約10分）
const WAVE_LEN = 90;          // 1ウェーブ＝90秒。これで「光景」が切り替わる（6ウェーブで9分）
// ウェーブごとのテーマ（背景の色・名前）。時間経過が目で分かるようにする
const WAVES = [
  { name: 'AWAKENING',  grid: 'rgba(60,90,160,.20)',  tint: '#05060c', accent: '#5cf0ff' },
  { name: 'SWARM',      grid: 'rgba(130,80,180,.20)', tint: '#090614', accent: '#c78bff' },
  { name: 'OVERGROWTH', grid: 'rgba(60,160,110,.18)', tint: '#04110b', accent: '#6bffb0' },
  { name: 'SCORCH',     grid: 'rgba(190,120,50,.18)', tint: '#120c04', accent: '#ffb24b' },
  { name: 'ONSLAUGHT',  grid: 'rgba(200,70,80,.20)',  tint: '#13050a', accent: '#ff6b8a' },
  { name: 'FINALE',     grid: 'rgba(230,50,100,.22)', tint: '#16040c', accent: '#ff4be0' },
];
function waveIndex(t) { return clamp(Math.floor(t / WAVE_LEN), 0, WAVES.length - 1); }

// 武器のメタ情報（アイコン・基本名・進化名）。進化後も「どの武器か」分かるよう一元管理
const WEAPON_META = {
  bolt:    { icon: '⚡', base: 'ボルト',     evo: 'スキャッターボルト' },
  orbit:   { icon: '🛰', base: 'オービット', evo: 'サテライトリング' },
  nova:    { icon: '💥', base: 'ノヴァ',     evo: 'スーパーノヴァ' },
  thunder: { icon: '🔱', base: 'サンダー',   evo: 'サンダーストーム' },
  frost:   { icon: '❄', base: 'フロスト',    evo: 'アブソリュートゼロ' },
  mine:    { icon: '💣', base: 'マイン',     evo: 'クラスターマイン' },
};
function weaponLabel(key, wp) { const m = WEAPON_META[key]; return (wp.evolved ? m.evo : m.base); }

// =========================================================================
//  サウンド（WebAudioでその場生成。外部ファイル不要）
// =========================================================================
const Sound = (() => {
  let actx = null;
  let muted = false;
  function ensure() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
  }
  // 単発のビープ。波形・周波数・長さ・音量を指定
  function blip(freq, dur, type, vol, slideTo) {
    if (muted) return;
    ensure();
    if (!actx) return;
    const t = actx.currentTime;
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(actx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  return {
    shoot: () => blip(660, 0.07, 'square', 0.04, 880),
    hit:   () => blip(220, 0.05, 'triangle', 0.04),
    kill:  () => blip(180, 0.16, 'sawtooth', 0.08, 60),
    hurt:  () => blip(120, 0.22, 'sawtooth', 0.18, 50),
    nova:  () => blip(140, 0.30, 'sine', 0.12, 520),
    zap:   () => blip(900, 0.10, 'square', 0.06, 300),
    boom:  () => blip(90, 0.25, 'sawtooth', 0.16, 50),
    levelup: () => { blip(523, 0.10, 'square', 0.14); setTimeout(() => blip(659, 0.10, 'square', 0.14), 90); setTimeout(() => blip(784, 0.16, 'square', 0.16), 180); },
    evolve:  () => { blip(440, 0.12, 'sawtooth', 0.14, 880); setTimeout(() => blip(880, 0.12, 'square', 0.14, 1320), 110); setTimeout(() => blip(1320, 0.20, 'sine', 0.16), 230); },
    boss:  () => { blip(80, 0.5, 'sawtooth', 0.22, 50); setTimeout(() => blip(120, 0.4, 'square', 0.18, 70), 120); },
    win:   () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'square', 0.16), i * 150)); },
    pick:  () => blip(880, 0.04, 'sine', 0.04, 1200),
    pause: () => blip(330, 0.08, 'sine', 0.08, 220),
    // オーバードライブ発動時の電撃ジングル
    overdrive: () => { blip(220, 0.04, 'sawtooth', 0.12, 880); setTimeout(() => blip(440, 0.04, 'sawtooth', 0.14, 1100), 50); setTimeout(() => blip(880, 0.20, 'square', 0.18, 1320), 100); },
    // ウェーブ切り替え時の上昇チャイム
    waveUp: () => { blip(440, 0.06, 'square', 0.10, 660); setTimeout(() => blip(660, 0.06, 'square', 0.12, 880), 80); setTimeout(() => blip(880, 0.14, 'sine', 0.14), 165); },
    // HPオーブ回収時（XPジェムより柔らかく温かい音）
    orbHeal: () => { blip(660, 0.08, 'sine', 0.07, 990); setTimeout(() => blip(880, 0.06, 'sine', 0.06), 60); },
    // 蘇生発動時の重い鼓動音
    revive: () => { blip(110, 0.18, 'sawtooth', 0.18, 60); setTimeout(() => blip(220, 0.14, 'sine', 0.14, 440), 120); },
    // 宝箱を開けた時のきらびやかな上昇アルペジオ（Cycle26）
    chest: () => { blip(523, 0.09, 'triangle', 0.13, 784); setTimeout(() => blip(784, 0.09, 'triangle', 0.14, 1047), 85); setTimeout(() => blip(1047, 0.09, 'triangle', 0.14, 1319), 170); setTimeout(() => blip(1319, 0.20, 'sine', 0.15), 255); },
    // ダッシュ発動の風切り音（Cycle33）
    dash: () => blip(300, 0.12, 'sine', 0.10, 900),
    // 低HP時の心拍音（Cycle32）：低いドッ・ドッの2連
    heartbeat: () => { blip(70, 0.09, 'sine', 0.20, 55); setTimeout(() => blip(60, 0.11, 'sine', 0.16, 45), 140); },
    toggle: () => { muted = !muted; return muted; },
    isMuted: () => muted,
    resume: ensure,
  };
})();

// =========================================================================
//  入力（キーボード + ポインタ）
// =========================================================================
const keys = {};
const pointer = { x: W / 2, y: H / 2, down: false, clicked: false };

// バーチャルスティック（スマホ用）。触れた場所に出る「浮動スティック」方式。
//  active:操作中  id:担当しているタッチの識別子  base:中心  nx,ny:向き(単位)  mag:倒し量0..1
const stick = { active: false, id: null, baseX: 0, baseY: 0, nx: 0, ny: 0, mag: 0 };
const STICK_MAX = 72;   // 最大の倒し幅（内部座標px）。これで mag=1（全速）
const STICK_DEAD = 9;   // 遊び。これ未満は動かさない（指の微ブレ対策）

// 画面右下のボタン（一時停止・サウンド）。内部座標で配置し、タップ判定する
const mobBtn = {
  pause: { x: W - 44, y: H - 44, r: 25 },
  sound: { x: W - 102, y: H - 44, r: 25 },
  dash:  { x: W - 64, y: H - 148, r: 48 }, // アクティブスキル（宝箱で入手。スマホでも Space 相当が使えるように）
};
function hitMobBtn(x, y) {
  for (const k in mobBtn) { const b = mobBtn[k]; const dx = x - b.x, dy = y - b.y; if (dx * dx + dy * dy <= (b.r + 8) * (b.r + 8)) return k; }
  return null;
}

// アクティブスキル発動（Space キーとスマホの⚡ボタンで共通。宝箱で入手するまでは使えない）
function tryDash() {
  if (state !== 'playing' || !game || !game.player) return;
  const p = game.player;
  if (!p.activeSkill) return; // 宝箱でスキルを手に入れるまでは何も起きない
  if (p.dashCd > 0) return;
  p.dashCd = 6 * p.skillCdMul; // 基本6秒。宝箱の強化でCDが半分ずつ縮む
  // フェイズダッシュ：0.18秒だけ移動速度×3で加速（無敵は宝箱2個目の強化「無敵ダッシュ」から）
  p.dashing = 0.18;
  if (p.dashInvuln) p.invuln = Math.max(p.invuln, 0.18);
  // ダッシュの発動感（Cycle33）：風切り音＋足元に白い破裂
  Sound.dash();
  burst(p.x, p.y, '#dcfaff', 10, 150);
  shake(2);
}

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  // ゲーム操作に使うキーは画面スクロール・フォーカス移動を止める
  if (['tab', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  if (k === 'm') { Sound.toggle(); }
  // メニュー操作はキーリピート（押しっぱなしの連続発火）を無視
  if (!e.repeat) handleMenuKey(k);
}, { passive: false });
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

function canvasPos(evt) {
  const r = canvas.getBoundingClientRect();
  const sx = W / r.width, sy = H / r.height; // 表示サイズ→内部解像度へ換算
  const cx = (evt.touches ? evt.touches[0].clientX : evt.clientX) - r.left;
  const cy = (evt.touches ? evt.touches[0].clientY : evt.clientY) - r.top;
  return { x: cx * sx, y: cy * sy };
}
// ---- マウス（PC）。従来どおり：押している間、画面中心から指す方向へ移動 ----
canvas.addEventListener('mousemove', e => { const p = canvasPos(e); pointer.x = p.x; pointer.y = p.y; });
canvas.addEventListener('mousedown', e => { Sound.resume(); pointer.down = true; pointer.clicked = true; const p = canvasPos(e); pointer.x = p.x; pointer.y = p.y; });
canvas.addEventListener('mouseup', () => { pointer.down = false; });

// ---- タッチ（スマホ）----
// 1つの Touch を内部座標へ変換
function touchToCanvas(t) {
  const r = canvas.getBoundingClientRect();
  return { x: (t.clientX - r.left) * (W / r.width), y: (t.clientY - r.top) * (H / r.height) };
}
canvas.addEventListener('touchstart', e => {
  Sound.resume();
  const t = e.changedTouches[0];
  const p = touchToCanvas(t);
  if (state === 'playing') {
    // 右下のボタン優先
    const hit = hitMobBtn(p.x, p.y);
    if (hit === 'pause') { Sound.pause(); state = 'status'; e.preventDefault(); return; } // スマホ停止→即ステータス
    if (hit === 'sound') { Sound.toggle(); e.preventDefault(); return; }
    if (hit === 'dash' && game.player.activeSkill) { tryDash(); e.preventDefault(); return; }
    // それ以外は、最初の指でスティック開始（触れた場所が中心）
    if (!stick.active) {
      stick.active = true; stick.id = t.identifier;
      stick.baseX = p.x; stick.baseY = p.y; stick.nx = 0; stick.ny = 0; stick.mag = 0;
    }
  } else {
    // タイトル/レベルアップ/一時停止などはタップ＝クリックとして処理
    pointer.down = true; pointer.clicked = true; pointer.x = p.x; pointer.y = p.y;
  }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  // 移動スティックの指は、レベルアップ画面などのメニュー中でも追従を続ける
  //（移動を押しっぱなしのまま、もう片方の指でアイテム選択→そのまま移動継続できるように）
  if (stick.active) {
    for (const t of e.changedTouches) {
      if (t.identifier !== stick.id) continue;
      const p = touchToCanvas(t);
      const dx = p.x - stick.baseX, dy = p.y - stick.baseY;
      const d = Math.hypot(dx, dy);
      if (d < STICK_DEAD) { stick.nx = 0; stick.ny = 0; stick.mag = 0; }
      else { stick.nx = dx / d; stick.ny = dy / d; stick.mag = Math.min(1, (d - STICK_DEAD) / (STICK_MAX - STICK_DEAD)); }
    }
  }
  if (state !== 'playing') {
    // メニュー中：移動用に押しっぱなしの指は無視し、それ以外の指だけをポインタ扱いにする
    for (const t of e.changedTouches) {
      if (stick.active && t.identifier === stick.id) continue;
      const p = touchToCanvas(t); pointer.x = p.x; pointer.y = p.y;
    }
  } else if (!stick.active && e.changedTouches.length > 0) {
    // カード選択に使った指をそのまま滑らせたら、その位置から移動スティックを開始
    const t = e.changedTouches[0];
    const p = touchToCanvas(t);
    stick.active = true; stick.id = t.identifier;
    stick.baseX = p.x; stick.baseY = p.y; stick.nx = 0; stick.ny = 0; stick.mag = 0;
  }
  e.preventDefault();
}, { passive: false });
function endTouch(e) {
  if (stick.active) {
    for (const t of e.changedTouches) {
      if (t.identifier === stick.id) { stick.active = false; stick.id = null; stick.nx = 0; stick.ny = 0; stick.mag = 0; }
    }
  }
  pointer.down = false;
  e.preventDefault();
}
canvas.addEventListener('touchend', endTouch, { passive: false });
canvas.addEventListener('touchcancel', endTouch, { passive: false });

// =========================================================================
//  ゲーム状態
// =========================================================================
let state = 'title';   // 'title' | 'playing' | 'levelup' | 'paused' | 'status' | 'gameover' | 'win' | 'chestitem'
let game = null;       // 現在のプレイデータ
let best = 0;          // 最高スコア（ブラウザに保存）
let totalDeaths = 0;   // 通算の死亡回数（ブラウザに保存、積み上がっていく）
try { best = parseInt(localStorage.getItem('neon_survivor_best') || '0', 10) || 0; } catch (e) {}
try { totalDeaths = parseInt(localStorage.getItem('neon_survivor_deaths') || '0', 10) || 0; } catch (e) {}
try { localStorage.removeItem('neon_survivor_endless'); localStorage.removeItem('neon_survivor_save'); } catch (e) {} // 旧エンドレス機能の保存データを掃除

// カメラ（プレイヤー中心。ワールド座標→画面座標の変換に使う）
const cam = { x: 0, y: 0, shake: 0 };

// プレイヤーの初期状態。weapons の lv は取得レベル（0=未所持）、evolved は進化済みフラグ
function newPlayer() {
  return {
    x: 0, y: 0, r: 17,
    speed: 210,
    hp: 120, maxHp: 120,
    level: 1, xp: 0, xpNext: 3,
    invuln: 0,             // 被弾後の無敵時間
    regenDelay: 0,         // 被弾後しばらく回復停止（粘りすぎ防止）
    pickupRange: 175,      // XP吸引の範囲（広めにして回収しやすく）
    dmgMul: 1,             // 全武器の与ダメージ倍率
    regen: 0.3,            // 毎秒回復（少しだけ初期付与）
    critChance: 0,         // 会心率（0〜）。会心で2.2倍
    armor: 0,              // 被ダメージ軽減率（0〜0.45）
    thorns: 0,             // 接触してきた敵への反射ダメージ
    dodge: 0,              // 被弾を確率で完全回避（0〜0.30）
    xpMul: 1,              // XP獲得倍率
    barrierActive: false,  // バリアアップグレードを取得済みか
    barrierCharge: 0,      // バリアの充電量（20秒で1発分）
    activeSkill: null,     // アクティブスキル（'dash'）。宝箱で入手するまで null
    skillLv: 0,            // 宝箱で進んだスキル強化の段階（0〜4）
    skillCdMul: 1,         // スキルCD倍率（宝箱の強化で半分ずつ縮む）
    dashInvuln: false,     // ダッシュ中に無敵になるか（宝箱2個目の強化で true）
    dashCd: 0,             // スキルのクールダウン
    dashing: 0,            // ダッシュ中の残り時間（0.18秒）
    hurtFlash: 0,          // 被弾の赤フラッシュ残り時間（無敵時間とは別管理）
    speedBuffT: 0,         // ニトロブースト（移動速度2倍）の残り秒数
    rushTimer: 0,          // ラッシュ発動中の残り秒数
    berserkLv: 0,          // バーサーク取得回数（HP低下時の火力ボーナス）
    adrenalineLv: 0,       // アドレナリン: 低HPほど移動速度ボーナス
    deathDefyLv: 0,        // 死の免除: 1回だけ瀕死から蘇生
    strikerLv: 0,          // ストライカー: ダッシュ中に敵にダメージ
    facing: { x: 1, y: 0 },// 向き（移動方向）
    upgradeCount: {},       // 各アップグレード個別の取得回数（上限管理用）
    weapons: {
      // オートエイムの弾。最初から所持
      bolt:    { lv: 1, evolved: false, cd: 0, interval: 0.50, dmg: 14, count: 1, speed: 460, pierce: 0, spread: 0.18 },
      // 体の周りを回る光弾
      orbit:   { lv: 0, evolved: false, cd: 0, count: 2, dmg: 10, radius: 80, rotSpeed: 2.6, angle: 0 },
      // 周期的に全方位へ広がる衝撃波
      nova:    { lv: 0, evolved: false, cd: 0, interval: 3.0, dmg: 26, radius: 230, speed: 520 },
      // 最寄りの敵に落雷し、近くの敵へ連鎖する
      thunder: { lv: 0, evolved: false, cd: 0, interval: 1.6, dmg: 20, chains: 3, range: 220 },
      // 周囲の敵を凍らせて遅くする冷気（小ダメージ＋減速）
      frost:   { lv: 0, evolved: false, cd: 0, tick: 0.35, dmg: 5, radius: 240, slow: 0.5 },
      // 地雷を設置。敵が触れると爆発（範囲ダメージ）
      mine:    { lv: 0, evolved: false, cd: 0, interval: 1.4, dmg: 44, radius: 78, max: 6 },
    },
  };
}

function resetGame(mode) {
  game = {
    mode: mode || 'normal',  // ゲームモード（現在は 'normal' のみ）
    time: 0,
    deaths: 0,              // このランで死んだ回数（コンティニューで積み上がる）
    freezeT: 0,             // タイムフリーズ（敵停止）の残り秒数（宝箱アイテム）
    chestCard: null,        // 宝箱アイテムの説明カード表示用
    kills: 0,
    enemies: [],
    bullets: [],            // プレイヤーの弾
    enemyBullets: [],       // 敵の弾（spitter・ボス）
    gems: [],
    mines: [],              // 設置された地雷
    shocks: [],             // 衝撃波リング（ノヴァ・爆発。見た目＋当たり）
    bombs: [],              // 爆撃の予告付き爆弾（爆撃型ミニボス／ラスボス）
    voidPhase: null,        // ラスボスのコアフェーズ（アリーナ侵食・安全地帯以外はダメージ床）
    bolts: [],              // 落雷の描画用ライン
    particles: [],
    texts: [],              // ダメージ数字などの浮き文字
    healthOrbs: [],         // ヘルスオーブ（ドロップ回復アイテム）
    chests: [],             // 宝箱（ミニボス等がドロップ。拾うと無料強化。Cycle26）
    chestsOpened: 0,        // 開けた宝箱の数（リザルト表示用）
    hitstop: 0,             // 大物撃破時に世界を一瞬止める残り秒数（Cycle31）
    heartbeatCd: 0,         // 心拍音の間隔タイマー（Cycle32）
    trail: [],              // プレイヤーの移動トレイル
    player: newPlayer(),
    spawnTimer: 0,
    wave: 0,                // 現在のウェーブ番号
    miniBossAt: WAVE_LEN,   // 次のミニボス出現時刻
    miniBossCount: 0,       // 出したミニボスの数（種類ローテに使う）
    finalBossSpawned: false,
    bossRef: null,          // ラスボスへの参照（撃破判定用）
    banner: null,           // 画面中央に出す演出バナー {text, sub, life, color}
    hordeArrow: null,       // ホード出現方向矢印 {angle, life}
    choices: [],            // レベルアップ時の3択
    rerollsLeft: 1,         // レベルアップ時の引き直し残り回数
    xpBoostTimer: 0,        // 強欲の輝き：残り秒数（0=無効）
    hordeCd: 0,             // 群れスポーンのクールダウン
    screenFlash: null,   // 画面フラッシュ { color, life, max }
    lastEliteBanner: 999, // エリート登場バナーの間隔管理
  };
  cam.x = 0; cam.y = 0; cam.shake = 0;
  // 開始バナー
  setBanner('WAVE 1', WAVES[0].name, WAVES[0].accent);
}

function setBanner(text, sub, color) {
  game.banner = { text, sub: sub || '', life: 2.4, max: 2.4, color: color || '#5cf0ff' };
}

// =========================================================================
//  敵の種類（経過時間tで強さがゆるやかに増す）
// =========================================================================
function enemyKinds(t) {
  // 従来の曲線に「時間経過でじわじわ効く倍率（クリア時にちょうど×2）」を掛ける
  // → 終盤にプレイヤーが強くなりすぎて敵が置いていかれるのを防ぐ
  const lateMul = 1 + t / CLEAR_TIME;
  const hpScale = (1 + t / 52 + (t * t) / 500000) * lateMul;   // 後半ほど加速度的に硬く（中盤の壁を緩和 Cycle37）
  const xpScale = 1 + t / 200;
  const dmgScale = (1 + t / 200 + (t * t) / 900000) * lateMul; // 序盤は控えめ→終盤きつく
  const spdLate = 1 + (t / CLEAR_TIME) * 0.8;                  // 速度の終盤補正はHP/攻撃より控えめに
  const spdScale = (1 + t / 700) * spdLate;                    // 速度カーブは緩やか（囲まれても振り切れる余地を残す）
  const xs = (base) => Math.max(1, Math.ceil(base * xpScale));
  const ds = (base) => Math.round(base * dmgScale * 0.8); // 攻撃力全体0.8倍（ユーザー要望）
  const ss = (base) => base * spdScale * 0.8;             // 移動速度全体0.8倍（ユーザー要望）
  return {
    grunt:    { hp: 24 * hpScale,  speed: ss(68),  r: 16, dmg: ds(14), xp: xs(1), color: '#ff5c8a', shape: 'circle', move: 'chase' },
    swift:    { hp: 16 * hpScale,  speed: ss(142), r: 13, dmg: ds(11), xp: xs(1), color: '#ffd23f', shape: 'tri',    move: 'chase' },
    tank:     { hp: 120 * hpScale, speed: ss(58),  r: 26, dmg: ds(25), xp: xs(3), color: '#7c5cff', shape: 'hex',    move: 'chase' },
    splitter: { hp: 46 * hpScale,  speed: ss(60),  r: 19, dmg: ds(15), xp: xs(2), color: '#6bffb0', shape: 'square', move: 'chase', splits: true },
    spitter:  { hp: 38 * hpScale,  speed: ss(54),  r: 17, dmg: ds(15), xp: xs(2), color: '#ff9b3d', shape: 'circle', move: 'chase', ranged: true },
    weaver:   { hp: 22 * hpScale,  speed: ss(110), r: 15, dmg: ds(11), xp: xs(1), color: '#ff8af0', shape: 'circle', move: 'weave' },
    bomber:   { hp: 37 * hpScale,  speed: ss(74),  r: 18, dmg: ds(31), xp: xs(2), color: '#ff7b3d', shape: 'square', move: 'bomb' },
    orbiter:  { hp: 30 * hpScale,  speed: ss(120), r: 15, dmg: ds(14), xp: xs(2), color: '#8a7bff', shape: 'tri',    move: 'orbit', ranged: true }, // 距離を保って旋回しながら撃つ
    brute:    { hp: 190 * hpScale, speed: ss(52),  r: 29, dmg: ds(42), xp: xs(4), color: '#ff5c3d', shape: 'hex',    move: 'chase' },                // 鈍重だが一撃が重い
    // ミニボスXPは専用の急カーブ：84×(1+t/120)。従来(28×(1+t/200))比で3.6〜4.4倍、
    // 後半のボスほど報酬が大きくなる（ユーザー要望：3倍以上・時間で変わるように）
    miniboss: { hp: 520 * hpScale, speed: ss(76),  r: 45, dmg: ds(30), xp: Math.ceil(84 * (1 + t / 120)), color: '#4be0ff', shape: 'boss',  move: 'chase' }, // HP1.3倍・サイズ1.5倍（ユーザー要望）
  };
}

function spawnEnemy(kindName, opts) {
  opts = opts || {};
  const t = game.time;
  const def = enemyKinds(t)[kindName];
  const p = game.player;
  let x, y;
  if (opts.x !== undefined) { x = opts.x; y = opts.y; }
  else {
    // プレイヤーから見て画面の外周にあたるリング上に出す
    const ang = Math.random() * TAU;
    const rad = 560 + Math.random() * 120;
    x = p.x + Math.cos(ang) * rad;
    y = p.y + Math.sin(ang) * rad;
  }
  const elite = !!opts.elite;
  const e = {
    kind: kindName,
    x, y,
    hp: def.hp, maxHp: def.hp,
    speed: def.speed, r: def.r, dmg: def.dmg, xp: def.xp, color: def.color,
    shape: def.shape, splits: !!def.splits, ranged: !!def.ranged, move: def.move || 'chase',
    hitFlash: 0,
    fireTimer: rand(1.5, 3.0),  // spitterの発射間隔
    knock: { x: 0, y: 0 },      // ノックバック速度
    seed: rand(0, TAU),         // 蛇行などの位相
    slowT: 0, freezeT: 0,       // 減速・凍結の残り時間
    elite: false,
  };
  if (kindName === 'bomber') e.fuse = -1;          // 自爆の導火（-1=未点火）
  if (kindName === 'brute') e.atkCd = rand(1.8, 3.0); // 叩きつけ攻撃のクールダウン
  if (opts.bossType) e.bossType = opts.bossType;    // ミニボス／ラスボスの攻撃タイプ
  if (elite) {
    // エリート：色違いで一回り大きく強い。倒すと旨味が大きい（爽快感）
    e.elite = true;
    e.hp = e.maxHp = def.hp * 3.2;
    e.r = def.r * 1.5;
    e.dmg = Math.round(def.dmg * 1.4);
    e.xp = def.xp * 4;
    e.speed = def.speed * 0.92;
  }
  game.enemies.push(e);
  return e;
}

// 各エネミーの出現スケジュール。wave0〜5 の重み（0=未登場）
// 序盤ザコは後半でフェードアウトし、強敵に置き換わる
const ENEMY_SCHED = {
  grunt:    [1.4, 0.9, 0.45, 0.10, 0,    0   ],  // ならし専用。wave2でフェード、wave4で消滅
  swift:    [0,   1.0, 0.65, 0.30, 0.08, 0   ],  // 高速型。wave4でほぼ消える
  weaver:   [0,   0.6, 0.70, 0.55, 0.20, 0.10],  // 蛇行型。長く残るが後半減る
  tank:     [0,   0,   0.80, 0.90, 0.85, 0.75],  // 重装型。wave2〜ずっと出る
  splitter: [0,   0,   0.80, 0.70, 0.60, 0.55],  // 分裂型。wave2〜
  spitter:  [0,   0,   0,    0.80, 0.70, 0.65],  // 遠距離型。wave3〜
  orbiter:  [0,   0,   0,    0.50, 0.65, 0.65],  // 旋回型。wave3〜
  bomber:   [0,   0,   0,    0,    0.65, 0.75],  // 自爆型。wave4〜
  brute:    [0,   0,   0,    0,    0.60, 0.75],  // 重量型。wave4〜
};

// ウェーブ内の進行割合で次ウェーブへ重みを補間 → なめらかな敵種類の移行
function pickSpawnKind(wave) {
  const wi = clamp(wave, 0, 5);
  const frac = game ? clamp((game.time - wi * WAVE_LEN) / WAVE_LEN, 0, 1) : 0;
  const entries = [];
  for (const kind in ENEMY_SCHED) {
    const ws = ENEMY_SCHED[kind];
    const wA = ws[wi] || 0;
    const wB = wi < 5 ? (ws[wi + 1] || 0) : wA;
    const wt = lerp(wA, wB, frac);
    if (wt > 0.001) entries.push([kind, wt]);
  }
  if (!entries.length) return 'tank';
  let sum = 0; for (const [, wt] of entries) sum += wt;
  let r = Math.random() * sum;
  for (const [kind, wt] of entries) { r -= wt; if (r <= 0) return kind; }
  return entries[entries.length - 1][0];
}

// =========================================================================
//  アップグレード（レベルアップ時の選択肢プール）
// =========================================================================
function buildUpgradePool() {
  const w = game.player.weapons;
  const p = game.player;
  const pool = [];
  const ic = (k) => WEAPON_META[k].icon;

  // ---- ボルト（初期武器） ----
  if (!w.bolt.evolved) {
    pool.push({ id: 'bolt_dmg', name: 'ボルト強化', desc: 'ボルトの威力 +7', icon: ic('bolt'),
      apply: () => { w.bolt.dmg += 7; } });
    pool.push({ id: 'bolt_count', name: 'ボルト追加', desc: '同時発射数 +1', icon: ic('bolt'), max: 5, lvOf: () => w.bolt.count,
      apply: () => { w.bolt.count += 1; w.bolt.spread += 0.04; w.bolt.lv++; } });
    pool.push({ id: 'bolt_rate', name: '連射速度', desc: 'ボルトの発射間隔 -16%', icon: ic('bolt'),
      apply: () => { w.bolt.interval = Math.max(0.14, w.bolt.interval * 0.84); } });
    if (w.bolt.count >= 3) {
      pool.push({ id: 'bolt_evo', name: 'スキャッターボルト', desc: '【ボルト進化】扇状に貫通弾を連射！', icon: ic('bolt'), isEvo: true,
        apply: () => { w.bolt.evolved = true; w.bolt.pierce = 3; w.bolt.count += 2; w.bolt.dmg += 8; w.bolt.interval = Math.max(0.12, w.bolt.interval * 0.8); w.bolt.spread += 0.06; } });
    }
  } else {
    pool.push({ id: 'bolt_dmg2', name: 'スキャッター増幅', desc: 'スキャッターの威力 +12', icon: ic('bolt'),
      apply: () => { w.bolt.dmg += 12; } });
  }

  // ---- オービット（周回弾） ----
  if (w.orbit.lv === 0) {
    pool.push({ id: 'orbit_get', name: 'オービット', desc: '体の周りを回る光弾を装備', icon: ic('orbit'), isNew: true, apply: () => { w.orbit.lv = 1; } });
  } else if (!w.orbit.evolved) {
    pool.push({ id: 'orbit_count', name: 'オービット追加', desc: '周回する光弾 +1', icon: ic('orbit'), max: 7, lvOf: () => w.orbit.count,
      apply: () => { w.orbit.count += 1; w.orbit.lv++; } });
    pool.push({ id: 'orbit_dmg', name: 'オービット強化', desc: '周回弾の威力 +9', icon: ic('orbit'),
      apply: () => { w.orbit.dmg += 9; w.orbit.lv++; } });
    if (w.orbit.count >= 4) {
      pool.push({ id: 'orbit_evo', name: 'サテライトリング', desc: '【オービット進化】巨大化＆高速回転で薙ぎ払う', icon: ic('orbit'), isEvo: true,
        apply: () => { w.orbit.evolved = true; w.orbit.radius *= 1.5; w.orbit.rotSpeed *= 1.7; w.orbit.dmg += 14; w.orbit.count += 1; } });
    }
  } else {
    pool.push({ id: 'orbit_dmg2', name: 'サテライト増幅', desc: 'サテライトの威力 +16', icon: ic('orbit'),
      apply: () => { w.orbit.dmg += 16; } });
  }

  // ---- ノヴァ（周期衝撃波） ----
  if (w.nova.lv === 0) {
    pool.push({ id: 'nova_get', name: 'ノヴァ', desc: '全方位に衝撃波を放つ', icon: ic('nova'), isNew: true, apply: () => { w.nova.lv = 1; } });
  } else if (!w.nova.evolved) {
    pool.push({ id: 'nova_dmg', name: 'ノヴァ強化', desc: '衝撃波の威力 +12', icon: ic('nova'),
      apply: () => { w.nova.dmg += 12; w.nova.lv++; } });
    pool.push({ id: 'nova_rate', name: 'ノヴァ加速', desc: '発動間隔 -20%', icon: ic('nova'),
      apply: () => { w.nova.interval = Math.max(1.1, w.nova.interval * 0.8); w.nova.lv++; } });
    if (w.nova.lv >= 4) {
      pool.push({ id: 'nova_evo', name: 'スーパーノヴァ', desc: '【ノヴァ進化】超特大の衝撃波で画面を制圧', icon: ic('nova'), isEvo: true,
        apply: () => { w.nova.evolved = true; w.nova.radius *= 1.5; w.nova.dmg += 20; w.nova.interval = Math.max(1.0, w.nova.interval * 0.8); } });
    }
  } else {
    pool.push({ id: 'nova_dmg2', name: 'スーパーノヴァ増幅', desc: '衝撃波の威力 +24', icon: ic('nova'),
      apply: () => { w.nova.dmg += 24; } });
  }

  // ---- サンダー（連鎖雷） ----
  if (w.thunder.lv === 0) {
    pool.push({ id: 'thunder_get', name: 'サンダー', desc: '敵に落雷し近くへ連鎖', icon: ic('thunder'), isNew: true, apply: () => { w.thunder.lv = 1; } });
  } else if (!w.thunder.evolved) {
    pool.push({ id: 'thunder_dmg', name: 'サンダー強化', desc: '落雷の威力 +10', icon: ic('thunder'),
      apply: () => { w.thunder.dmg += 10; w.thunder.lv++; } });
    pool.push({ id: 'thunder_chain', name: '連鎖拡大', desc: '連鎖する敵の数 +2', icon: ic('thunder'), max: 9, lvOf: () => w.thunder.chains,
      apply: () => { w.thunder.chains += 2; w.thunder.lv++; } });
    if (w.thunder.lv >= 4) {
      pool.push({ id: 'thunder_evo', name: 'サンダーストーム', desc: '【サンダー進化】高速の落雷が無数に連鎖', icon: ic('thunder'), isEvo: true,
        apply: () => { w.thunder.evolved = true; w.thunder.chains += 4; w.thunder.dmg += 14; w.thunder.interval = Math.max(0.5, w.thunder.interval * 0.6); } });
    }
  } else {
    pool.push({ id: 'thunder_dmg2', name: 'ストーム増幅', desc: '落雷の威力 +18', icon: ic('thunder'),
      apply: () => { w.thunder.dmg += 18; } });
  }

  // ---- フロスト（冷気・減速） ----
  if (w.frost.lv === 0) {
    pool.push({ id: 'frost_get', name: 'フロスト', desc: '周囲の敵を凍らせ遅くする', icon: ic('frost'), isNew: true, apply: () => { w.frost.lv = 1; } });
  } else if (!w.frost.evolved) {
    pool.push({ id: 'frost_dmg', name: 'フロスト強化', desc: '冷気の威力 +5・範囲 +12%', icon: ic('frost'),
      apply: () => { w.frost.dmg += 5; w.frost.radius *= 1.12; w.frost.lv++; } });
    pool.push({ id: 'frost_slow', name: '凍結強化', desc: '減速を強める', icon: ic('frost'),
      apply: () => { w.frost.slow = Math.max(0.25, w.frost.slow - 0.08); w.frost.lv++; } });
    if (w.frost.lv >= 4) {
      pool.push({ id: 'frost_evo', name: 'アブソリュートゼロ', desc: '【フロスト進化】時々敵を完全凍結させる', icon: ic('frost'), isEvo: true,
        apply: () => { w.frost.evolved = true; w.frost.radius *= 1.3; w.frost.dmg += 8; } });
    }
  } else {
    pool.push({ id: 'frost_dmg2', name: 'ゼロ点増幅', desc: '冷気の威力 +12', icon: ic('frost'),
      apply: () => { w.frost.dmg += 12; } });
  }

  // ---- マイン（地雷） ----
  if (w.mine.lv === 0) {
    pool.push({ id: 'mine_get', name: 'マイン', desc: '地雷を置く。触れた敵を爆破', icon: ic('mine'), isNew: true, apply: () => { w.mine.lv = 1; } });
  } else if (!w.mine.evolved) {
    pool.push({ id: 'mine_dmg', name: 'マイン強化', desc: '爆発の威力 +20・範囲 +12%', icon: ic('mine'),
      apply: () => { w.mine.dmg += 20; w.mine.radius *= 1.12; w.mine.lv++; } });
    pool.push({ id: 'mine_max', name: '増設', desc: '同時設置数 +2・設置を高速化', icon: ic('mine'), max: 14, lvOf: () => w.mine.max,
      apply: () => { w.mine.max += 2; w.mine.interval = Math.max(0.5, w.mine.interval * 0.82); w.mine.lv++; } });
    if (w.mine.lv >= 4) {
      pool.push({ id: 'mine_evo', name: 'クラスターマイン', desc: '【マイン進化】爆発で子地雷を撒き散らす', icon: ic('mine'), isEvo: true,
        apply: () => { w.mine.evolved = true; w.mine.dmg += 16; w.mine.radius *= 1.15; } });
    }
  } else {
    pool.push({ id: 'mine_dmg2', name: 'クラスター増幅', desc: '爆発の威力 +30', icon: ic('mine'),
      apply: () => { w.mine.dmg += 30; } });
  }

  // ---- ステータス系（いつでも候補） ----
  // レベルアップ回数を減らす代わりに、1回あたりの伸びを強化（ユーザー要望）
  pool.push({ id: 'maxhp', name: '体力増強', desc: '最大HP +45（HPを45回復）', icon: '❤', apply: () => { p.maxHp += 45; p.hp = Math.min(p.maxHp, p.hp + 45); } });
  pool.push({ id: 'speed', name: '俊足', desc: '移動速度 +14%', icon: '👟', apply: () => { p.speed *= 1.14; } });
  pool.push({ id: 'power', name: '攻撃力上昇', desc: '全武器ダメージ +17%', icon: '💢', apply: () => { p.dmgMul *= 1.17; } });
  // 再生は上限ありで青天井にしない（毎秒回復が敵火力を上回って不死化するのを防ぐ）
  if (p.regen < 6) pool.push({ id: 'regen', name: '再生', desc: '毎秒HP +1.3 回復（上限あり）', icon: '✚', apply: () => { p.regen = Math.min(6, p.regen + 1.3); } });
  if (p.critChance < 0.5) pool.push({ id: 'crit', name: '会心', desc: '会心率 +11%（2.2倍ダメージ）', icon: '🎯', apply: () => { p.critChance += 0.11; } });
  if (p.armor < 0.45) pool.push({ id: 'armor', name: '装甲', desc: '被ダメージ -12%（上限45%）', icon: '🛡', apply: () => { p.armor = Math.min(0.45, p.armor + 0.12); } });
  // 一時バフ（重ねがけで延長、最大60秒）
  pool.push({ id: 'greed', name: '強欲の輝き', desc: '30秒間 XP+75%（重ねがけで延長）', icon: '💎', apply: () => { game.xpBoostTimer = Math.min(60, (game.xpBoostTimer || 0) + 30); floatText(p.x, p.y - 40, 'XPブースト 30秒!', '#ffea00'); } });
  // ---- 追加パッシブ（種類を増やして組み立ての幅を出す） ----
  pool.push({ id: 'haste', name: '高速詠唱', desc: '全武器の発動が 11% 速くなる', icon: '⏩', apply: () => applyHaste(0.89) });
  pool.push({ id: 'thorns', name: 'スパイク装甲', desc: '接触した敵に反射ダメージ +22', icon: '🌵', apply: () => { p.thorns = (p.thorns || 0) + 22; } });
  if ((p.dodge || 0) < 0.30) pool.push({ id: 'dodge', name: '回避', desc: '被弾を 13% で完全回避（上限30%）', icon: '🌀', apply: () => { p.dodge = Math.min(0.30, (p.dodge || 0) + 0.13); } });
  if (!p.barrierActive) pool.push({ id: 'barrier', name: 'バリア', desc: '20秒ごとに被弾を1回完全無効化するシールド', icon: '🔵', apply: () => { p.barrierActive = true; p.barrierCharge = 0; } });
  // ---- 新パッシブ: バーサーク / ラッシュ / フェイズダッシュ ----
  if (p.berserkLv < 2) pool.push({ id: 'berserk', name: 'バーサーク', desc: 'HP40%未満で全ダメージ+50%（2回で+100%）', icon: '🔥', apply: () => { p.berserkLv++; floatText(p.x, p.y - 40, 'バーサーク！', '#ff5c00'); } });
  // アドレナリン: 低HPほど速度ボーナス（3段階、HP0で最大+45%）
  if (p.adrenalineLv < 3) pool.push({ id: 'adrenaline', name: 'アドレナリン', desc: '低HPほど移動速度+（HP0で+15% × 段階数）', icon: '💉', apply: () => { p.adrenalineLv++; floatText(p.x, p.y - 40, 'アドレナリン！', '#ff6bbb'); } });
  // 死の免除: 1回だけ致死ダメージを耐える
  if (p.deathDefyLv < 1) pool.push({ id: 'deathdefy', name: '死の免除', desc: '一度だけHP1で致死ダメージを生き残る', icon: '⚰️', apply: () => { p.deathDefyLv = 1; floatText(p.x, p.y - 40, '死の免除！', '#ff4b4b'); } });
  // ストライカー: ダッシュ中に接触した敵にダメージ
  if (p.activeSkill === 'dash' && p.strikerLv < 2) pool.push({ id: 'striker', name: 'ストライカー', desc: 'ダッシュで敵に突撃するとダメージ（2段階）', icon: '🗡️', apply: () => { p.strikerLv++; floatText(p.x, p.y - 40, 'ストライカー！', '#ff8c00'); } });
  return pool;
}

function rollChoices() {
  let pool = buildUpgradePool();
  pool = pool.filter(o => !(o.max && o.lvOf && o.lvOf() >= o.max));

  const evos = pool.filter(o => o.isEvo);
  const weaponUpgrades = pool.filter(o => !o.isEvo && o.id && /^(bolt|orbit|nova|thunder|frost|mine)/.test(o.id));
  const rest = pool.filter(o => !o.isEvo && !(o.id && /^(bolt|orbit|nova|thunder|frost|mine)/.test(o.id)));

  shuffle(evos); shuffle(weaponUpgrades); shuffle(rest);

  const picks = [];
  // 進化があれば最優先で1枚
  if (evos.length) picks.push(evos[0]);
  // 武器系を少なくとも1枚含める保証
  if (weaponUpgrades.length && picks.length < 3) picks.push(weaponUpgrades[0]);
  // 残りをrestで埋める
  for (const o of rest) { if (picks.length >= 3) break; picks.push(o); }
  // まだ足りなければ武器系の残りで補充
  for (const o of weaponUpgrades.slice(1)) { if (picks.length >= 3) break; picks.push(o); }

  // 未取得アイテムが1つも選ばれていなければ、poolから未取得を1枚差し替えて保証する
  const uc = game.player.upgradeCount || {};
  const isNew = o => !o.id || !uc[o.id];
  if (picks.length > 0 && !picks.some(isNew)) {
    const newItems = pool.filter(o => isNew(o) && !picks.includes(o));
    if (newItems.length) {
      shuffle(newItems);
      picks[picks.length - 1] = newItems[0];
    }
  }

  // 順序をシャッフルして固定位置に見えないようにする
  shuffle(picks);
  game.choices = picks.slice(0, 3);
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } }

// 全武器の発動を一律で速くする（高速詠唱パッシブ用）。間隔・tick を係数倍して下限で止める
function applyHaste(f) {
  const w = game.player.weapons;
  w.bolt.interval = Math.max(0.10, w.bolt.interval * f);
  w.nova.interval = Math.max(0.9, w.nova.interval * f);
  w.thunder.interval = Math.max(0.4, w.thunder.interval * f);
  w.mine.interval = Math.max(0.4, w.mine.interval * f);
  w.frost.tick = Math.max(0.20, w.frost.tick * f);
}

function applyChoice(idx) {
  const c = game.choices[idx];
  if (!c) return;
  c.apply();
  // 取得回数を記録（Cycle21: これまで未加算で「未取得1枚保証」が機能していなかったバグ修正）
  if (c.id) game.player.upgradeCount[c.id] = (game.player.upgradeCount[c.id] || 0) + 1;
  // レベルアップ後に画面内のXPジェムを全部自動吸引（Cycle4）
  for (const gem of game.gems) { gem.vx += (game.player.x - gem.x) * 4; gem.vy += (game.player.y - gem.y) * 4; }
  game.rerollsLeft = 1;
  pointer.down = false;
  state = 'playing';
  game.player.invuln = Math.max(game.player.invuln, 2); // 選択画面明けの不意打ち被弾を防ぐ2秒無敵（ユーザー要望）
  floatText(game.player.x, game.player.y - 50, 'Lv ' + game.player.level, '#8affc1', true);
  if (c.isEvo) { Sound.evolve(); shake(10); setBanner('EVOLVED!', c.name, '#ffd23f'); }
  else Sound.pick();
}

function rerollChoices() {
  // Cycle24: levelup 画面以外で誤って引き直し回数を消費しないようガード
  if (state !== 'levelup' || !game || game.rerollsLeft <= 0) return;
  game.rerollsLeft--;
  rollChoices();
  Sound.pick();
}

// 宝箱のスキル強化ラダー：開けるたびに右下ボタンのスキルが決まった順で1段ずつ進化していく
const SKILL_UPGRADES = [
  { icon: '⚡', name: 'フェイズダッシュ', desc: 'Space / ⚡ボタンで発動。向いている方向へ短距離を一気に加速する（クールダウン6秒）', apply(p) { p.activeSkill = 'dash'; } },
  { icon: '🛡️', name: '無敵ダッシュ', desc: 'ダッシュ中が無敵に！敵や弾をすり抜けて駆け抜けられる', apply(p) { p.dashInvuln = true; } },
  { icon: '🔋', name: 'スキルチャージャー', desc: 'スキルのクールダウンが半分（6秒→3秒）になった！', apply(p) { p.skillCdMul *= 0.5; } },
  { icon: '💠', name: 'オーバーチャージ', desc: 'クールダウンがさらに半分（3秒→1.5秒）に！どんどん使える', apply(p) { p.skillCdMul *= 0.5; } },
];
// 5個目以降の宝箱の中身（スキルが最大まで進化した後）
const CHEST_BONUS = { icon: '💖', name: 'フルリペア', desc: 'HPが全回復した！', apply(p) { p.hp = p.maxHp; } };

// 宝箱を開ける：スキル強化が順番に1段ずつ手に入る（全4段。以降は全回復）
function openChest(ch) {
  const p = game.player;
  let item;
  if (p.skillLv < SKILL_UPGRADES.length) {
    item = SKILL_UPGRADES[p.skillLv];
    p.skillLv++;
  } else {
    item = CHEST_BONUS;
  }
  item.apply(p);
  p.hp = Math.min(p.maxHp, p.hp + 15); // おまけの回復
  game.chestsOpened++;
  floatText(ch.x, ch.y - 24, item.icon + ' ' + item.name + '!', '#ffd23f', true);
  burst(ch.x, ch.y, '#ffd23f', 30, 300);
  Sound.chest();
  game.chestCard = item;   // 説明カードを表示（任意の操作で閉じる）
  state = 'chestitem';
}

// =========================================================================
//  エフェクト（パーティクル・浮き文字・画面シェイク・爆発）
// =========================================================================
function burst(x, y, color, n, power) {
  // スマホは発熱対策としてパーティクル数を半分に間引く（見た目の派手さは概ね維持・ユーザー要望）
  if (IS_TOUCH) n = Math.ceil(n * 0.5);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = rand(40, power);
    game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.6), max: 0.6, color, r: rand(1.5, 3.5) });
  }
}
function floatText(x, y, txt, color, big) {
  game.texts.push({ x, y, txt, color: color || '#fff', life: big ? 1.0 : 0.7, max: big ? 1.0 : 0.7, vy: -38, big: !!big });
}
function shake(amount) { cam.shake = Math.min(24, cam.shake + amount); }

// 拡大する衝撃波リングを発生（敵を巻き込む）。爆発・ノヴァ共通
function makeShock(x, y, radius, dmg, color, dur) {
  const d = dur || 0.28;
  game.shocks.push({ x, y, r: 10, vr: radius / d, life: d, maxR: radius, dmg, color, hitSet: new Set() });
}
function explode(x, y, radius, dmg, color) {
  makeShock(x, y, radius, dmg, color);
  burst(x, y, color, 18, 260);
  Sound.boom();
}

// =========================================================================
//  ダメージ処理
// =========================================================================
// showNum: ダメージ数字を出すか（弾は出す／範囲攻撃は出さない＝画面が騒がしくならない）
function damageEnemy(e, dmg, kbx, kby, showNum) {
  if (e.dead) return;
  if (e.coreInvuln) return; // コアフェーズ中（アリーナ侵食の無敵状態）はダメージを受けない
  const p = game.player;
  let crit = false;
  const cc = p.critChance;
  if (cc > 0 && Math.random() < cc) { dmg *= 2.2; crit = true; }
  // バーサーク：HP40%未満のとき火力ボーナス
  if (p.berserkLv > 0 && p.hp / p.maxHp < 0.4) dmg *= (1 + 0.5 * p.berserkLv);
  // コアフェーズ明けの「隙」：一定時間だけ被ダメ1.6倍（耐え抜いた見返り）
  if (e.coreExposed > 0) dmg *= 1.6;
  e.hp -= dmg;
  e.hitFlash = 0.08;
  if (crit) {
    floatText(e.x, e.y - e.r - 6, '★CRIT! ' + Math.round(dmg), '#ffd23f', true);
    burst(e.x, e.y, '#ffd23f', 6, 100); // 会心命中でゴールドの粒子
  } else if (showNum) floatText(e.x, e.y - e.r, '' + Math.round(dmg), '#fff');
  if (kbx !== undefined && !e.boss) { e.knock.x += kbx; e.knock.y += kby; }
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  game.kills++;
  // ラッシュ：キルごとに速度ブーストタイマーをリフレッシュ
  if (game.player.rushUpgrade) game.player.rushTimer = 1.5;

  const isBig = e.kind === 'miniboss' || e.boss;
  burst(e.x, e.y, e.color, isBig ? 46 : (e.elite ? 22 : 12), isBig ? 340 : 190);
  if (e.kind === 'miniboss') {
    // ミニボス撃破演出
    game.screenFlash = { color: e.color || '#4be0ff', life: 0.35, max: 0.35 };
    setBanner('BOSS SLAIN!', 'ミニボスを撃破！', e.color || '#4be0ff');
    // 宝箱を確定ドロップ（Cycle26）
    game.chests.push({ x: e.x, y: e.y, r: 15, t: 0 });
  }

  // 分裂する敵は小型を散らす
  if (e.splits && !e.elite) {
    for (let i = 0; i < 2; i++) {
      const c = spawnEnemy('grunt', { x: e.x + rand(-14, 14), y: e.y + rand(-14, 14) });
      c.hp = c.maxHp = Math.max(8, c.maxHp * 0.5);
      c.r *= 0.8;
    }
  }

  // XPジェムをドロップ
  const drops = e.boss ? 16 : (e.kind === 'miniboss' ? 12 : (e.elite ? 4 : 1)); // ミニボスは12個ばら撒いて「大量」感を出す（合計XPは変わらない）
  const per = Math.max(1, Math.round(e.xp / drops));
  for (let i = 0; i < drops; i++) {
    game.gems.push({ x: e.x + rand(-16, 16), y: e.y + rand(-16, 16), value: per, vx: rand(-40, 40), vy: rand(-40, 40), big: e.elite || isBig });
  }

  if (isBig) { game.hitstop = e.boss ? 0.18 : 0.10; } // 撃破の重み（Cycle31。シェイクはユーザー要望で廃止）
  Sound.kill();

  // 雑魚敵限定の処理
  if (!isBig) {
    // ヘルスオーブ：低HPほど出やすい（Cycle16）
    const hpRatio = game.player.hp / game.player.maxHp;
    const orbChance = 0.035 + Math.max(0, 0.5 - hpRatio) * 0.10; // 基礎率を引き上げ（Cycle38）
    if (Math.random() < orbChance) {
      game.healthOrbs.push({ x: e.x, y: e.y, r: 7, value: 15, vx: rand(-24, 24), vy: rand(-24, 24) });
    }
  }

  // ラスボス撃破 → 勝利 or エンドレス周回
  if (e.boss) onBossDefeated();
}

function gainXP(amount) {
  const p = game.player, g = game;
  const boostMul = g.xpBoostTimer > 0 ? 1.75 : 1; // 強欲の輝きが有効なら+75%
  p.xp += amount * p.xpMul * boostMul;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    // 後半ほど重くなる2次曲線。レベルアップ回数を抑える代わりに1回の強化量を上げた（ユーザー要望）
    p.xpNext = Math.round(5 + p.level * 3.8 + p.level * p.level * 0.2);
    rollChoices();
    pointer.down = false; // レベルアップ突入時も移動入力をリセット
    state = 'levelup';
    Sound.levelup();
    burst(p.x, p.y, '#9fe8ff', 24, 240);
  }
}

// =========================================================================
//  更新（1ステップ = 1/60秒）
// =========================================================================
const STEP = 1 / 60;

// 1フレームぶんのゲーム進行。処理は意味ごとの関数に分けてある（下に定義）
function update(dt) {
  const g = game;
  // ヒットストップ（Cycle31）：大物撃破の瞬間だけ世界が一瞬止まり、重みが出る
  if (g.hitstop > 0) { g.hitstop -= dt; return; }
  g.time += dt;

  updateTimers(dt);                    // 各種タイマー（ウェーブ・コンボ・オーバードライブ等）
  updatePlayerMovement(dt);            // プレイヤーの移動・ダッシュ・回復・カメラ
  updateSpawning(dt);                  // 敵のスポーン
  if (!updateEnemies(dt)) return;      // 敵の移動・攻撃・接触（プレイヤー死亡なら中断）
  updateWeapons(dt);                   // 武器の自動攻撃
  if (!updateProjectiles(dt)) return;  // 弾・地雷・衝撃波（プレイヤー死亡なら中断）
  updatePickups(dt);                   // XPジェム・回復オーブ・宝箱の回収
  updateBombs(dt);                     // 爆撃の予告円と爆発
  updateVoidPhase(dt);                 // ラスボスのコアフェーズ（アリーナ侵食）
  updateFx(dt);                        // パーティクル・浮き文字
  removeDeadEntities();                // 死んだものの掃除
}

// 各種タイマーの進行（ウェーブ遷移・コンボ・心拍音・オーバードライブなど）
function updateTimers(dt) {
  const g = game, p = g.player;
  // 宝箱アイテムの残り時間（タイムフリーズ／ニトロブースト）
  if (g.freezeT > 0) g.freezeT -= dt;
  if (p.speedBuffT > 0) p.speedBuffT -= dt;

  // --- ウェーブ遷移の検知（背景・敵構成が切り替わる節目） ---
  if (g.mode === 'normal') {
    const wi = waveIndex(g.time);
    if (wi !== g.wave && g.time < CLEAR_TIME) {
      g.wave = wi;
      setBanner('WAVE ' + (wi + 1), WAVES[wi].name, WAVES[wi].accent);
      shake(6);
      // ウェーブ切り替えフラッシュ（Cycle20）：アクセントカラーで画面を光らせる
      g.screenFlash = { color: WAVES[wi].accent, life: 0.7, max: 0.7 };
      Sound.waveUp();
      // ウェーブ切り替え時に少し回復（新しいウェーブへの景気づけ）
      const heal = 20;
      p.hp = Math.min(p.maxHp, p.hp + heal);
      floatText(p.x, p.y - 30, '+' + heal + ' HP', '#8affc1', 22);
    }
  }

  // XPブーストタイマー（強欲の輝き）
  if (g.xpBoostTimer > 0) {
    g.xpBoostTimer -= dt;
    if (g.xpBoostTimer <= 0) { g.xpBoostTimer = 0; floatText(p.x, p.y - 50, 'XPブースト終了', '#cc9900'); }
  }

  // 低HPの心拍音（Cycle32）：赤ビネットと同期して耳でも危機を知らせる
  if (p.hp / p.maxHp < 0.35) {
    g.heartbeatCd -= dt;
    if (g.heartbeatCd <= 0) { Sound.heartbeat(); g.heartbeatCd = 0.9; }
  } else g.heartbeatCd = 0;

  // バナーの寿命
  if (g.banner) { g.banner.life -= dt; if (g.banner.life <= 0) g.banner = null; }
  // エリートバナーの間隔タイマー（Cycle19）
  g.lastEliteBanner += dt;
}

// プレイヤーの移動入力・ダッシュ・回復・カメラ追従
function updatePlayerMovement(dt) {
  const g = game, p = g.player;
  let mx = 0, my = 0;
  let moveScale = 1; // スティックの倒し量に応じた速度（0..1）。キー/マウスは常に1
  if (keys['w'] || keys['arrowup']) my -= 1;
  if (keys['s'] || keys['arrowdown']) my += 1;
  if (keys['a'] || keys['arrowleft']) mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  if (pointer.down) { mx += (pointer.x - W / 2); my += (pointer.y - H / 2); }
  // バーチャルスティック（スマホ）。倒し量で速度が変わる
  if (stick.active && stick.mag > 0) { mx += stick.nx; my += stick.ny; moveScale = stick.mag; }
  if (DEMO) {
    // デモ自動操作（検証用の "そこそこ上手いプレイヤー" 近似）
    let ax = 0, ay = 0;
    for (const e of g.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y; const d = Math.hypot(dx, dy) || 1;
      if (d < 210) { const wgt = (210 - d) / 210; ax += (dx / d) * wgt; ay += (dy / d) * wgt; }
    }
    for (const b of g.enemyBullets) {
      const dx = p.x - b.x, dy = p.y - b.y; const d = Math.hypot(dx, dy) || 1;
      if (d < 120) { const wgt = (120 - d) / 120; ax += (dx / d) * wgt * 1.7; ay += (dy / d) * wgt * 1.7; }
    }
    let gg = null, gd = Infinity;
    for (const gem of g.gems) { const dd = dist2(gem.x, gem.y, p.x, p.y); if (dd < gd) { gd = dd; gg = gem; } }
    let gx = 0, gy = 0;
    if (gg) { const d = Math.hypot(gg.x - p.x, gg.y - p.y) || 1; gx = (gg.x - p.x) / d; gy = (gg.y - p.y) / d; }
    mx += ax * 2.0 + gx * 1.1 - p.x * 0.0006;
    my += ay * 2.0 + gy * 1.1 - p.y * 0.0006;
  }
  // ラッシュタイマーの減算
  if (p.rushTimer > 0) p.rushTimer -= dt;
  const ml = Math.hypot(mx, my);
  if (ml > 0.001) {
    mx /= ml; my /= ml;
    const adrSpd = p.adrenalineLv > 0 ? (1 + p.adrenalineLv * 0.15 * (1 - clamp(p.hp / p.maxHp, 0, 1))) : 1;
    const nitroSpd = p.speedBuffT > 0 ? 2 : 1; // ニトロブースト（宝箱アイテム）
    p.x += mx * p.speed * moveScale * adrSpd * nitroSpd * dt;
    p.y += my * p.speed * moveScale * adrSpd * nitroSpd * dt;
    p.facing.x = mx; p.facing.y = my;
  }

  // プレイヤートレイル（移動の軌跡を残す）
  if (ml > 0.001 || p.dashing > 0) {
    const isDash = p.dashing > 0;
    g.trail.push({ x: p.x, y: p.y, r: p.r * (isDash ? 0.85 : 0.55), life: isDash ? 0.22 : 0.35, dash: isDash });
    if (g.trail.length > 30) g.trail.shift();
  }
  for (const pt of g.trail) pt.life -= dt;
  g.trail = g.trail.filter(pt => pt.life > 0);

  // ダッシュ中は移動速度×3で前進（無敵は宝箱2個目の強化「ゴーストダッシュ」から）
  if (p.dashing > 0) {
    p.dashing -= dt;
    p.x += p.facing.x * p.speed * 3 * dt;
    p.y += p.facing.y * p.speed * 3 * dt;
    if (p.dashInvuln) p.invuln = Math.max(p.invuln, p.dashing);
    // ストライカー: ダッシュ中に敵に接触するとダメージ
    if (p.strikerLv > 0) {
      for (const e of g.enemies) {
        if (e.dead) continue;
        if (dist2(p.x, p.y, e.x, e.y) < (p.r + e.r + 6) * (p.r + e.r + 6)) {
          damageEnemy(e, 35 * p.strikerLv * p.dmgMul, p.facing.x * 350, p.facing.y * 350, true);
        }
      }
    }
  }
  if (p.dashCd > 0) p.dashCd -= dt;

  // アリーナ境界クランプ（中心0,0 から ARENA_R を超えたら押し戻す）
  { const pd = Math.hypot(p.x, p.y); if (pd > ARENA_R - p.r) { const sc = (ARENA_R - p.r) / pd; p.x *= sc; p.y *= sc; } }

  // 回復（被弾後しばらくは止まる）・無敵時間
  if (p.regenDelay > 0) p.regenDelay -= dt;
  if (p.regen > 0 && p.regenDelay <= 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
  if (p.invuln > 0) p.invuln -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;
  // バリア充電（Cycle14）
  if (p.barrierActive && p.barrierCharge < 20) {
    p.barrierCharge = Math.min(20, p.barrierCharge + dt);
  }

  // --- カメラ追従 ---
  cam.x += ((p.x - W / 2) - cam.x) * Math.min(1, dt * 8);
  cam.y += ((p.y - H / 2) - cam.y) * Math.min(1, dt * 8);
  if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 40);
}

// 敵の移動・攻撃・プレイヤーとの接触。プレイヤーが倒れたら false を返す
function updateEnemies(dt) {
  const g = game, p = g.player;
  for (const e of g.enemies) {
    if (e.dead) continue;
    // プレイヤーから離れすぎた敵は反対側のリングへ湧き直す（常に周囲に敵を保つ）
    if (!e.boss && dist2(e.x, e.y, p.x, p.y) > 1000 * 1000) {
      const ra = Math.random() * TAU, rr = 540 + Math.random() * 120;
      e.x = p.x + Math.cos(ra) * rr; e.y = p.y + Math.sin(ra) * rr;
      e.knock.x = 0; e.knock.y = 0;
    }
    let dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    // コアフェーズ中はボス以外の雑魚も侵食に呑まれて静止する（安全地帯回避だけに集中させる）
    const voidFrozen = !!g.voidPhase && !e.boss;
    // タイムフリーズ中（宝箱アイテム）は敵の移動と攻撃が止まる
    if (g.freezeT <= 0) {
      if (!e.coreInvuln && !voidFrozen) moveEnemy(e, dt, dx, dy, d, p); // コアフェーズ中は静止（脅威は安全地帯の外だけ）
      if (e.dead) continue; // bomberが自爆した等
      if (e.hitFlash > 0) e.hitFlash -= dt;

      // 攻撃：ボスは固有パターン、spitterは弾、bruteは叩きつけ
      if (e.boss || e.kind === 'miniboss') updateBossBehavior(e, dt, dx, dy, d);
      else if (e.ranged && !voidFrozen) {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && d < 520) { fireEnemyShot(e, dx, dy); e.fireTimer = rand(2.0, 3.2); }
      } else if (e.kind === 'brute' && !voidFrozen) {
        updateBruteSlam(e, dt, d, p);
      }
    }

    // プレイヤーへの接触ダメージ（コアフェーズ中は無効＝安全地帯の管理だけに専念させる）
    if (d < e.r + p.r && p.invuln <= 0 && !e.coreInvuln && !voidFrozen) {
      // スパイク装甲：触れてきた敵に反射ダメージ（ボスは怯ませないよう少なめ）
      if (p.thorns > 0 && !e.dead) damageEnemy(e, e.boss ? p.thorns * 0.5 : p.thorns, 0, 0, false);
      hurtPlayer(e.dmg);
      if (p.hp <= 0) return false;
    }
  }
  separateEnemies();
  return true;
}

// 習得済みの武器をすべて動かす（未習得のものは各関数の先頭で抜ける）
function updateWeapons(dt) {
  updateBolt(dt);
  updateOrbit(dt);
  updateNova(dt);
  updateThunder(dt);
  updateFrost(dt);
  updateMine(dt);
}

// 弾・地雷・衝撃波の移動と当たり判定。プレイヤーが倒れたら false を返す
function updateProjectiles(dt) {
  const g = game, p = g.player;
  // --- 地雷：armが済んだら敵接触で爆発 ---
  for (const m of g.mines) {
    if (m.arm > 0) { m.arm -= dt; continue; }
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (dist2(m.x, m.y, e.x, e.y) < (e.r + m.r) * (e.r + m.r)) {
        const wm = p.weapons.mine;
        explode(m.x, m.y, wm.radius, weaponDmg(wm), '#ffb24b');
        if (wm.evolved && !m.small) { for (let k = 0; k < 3; k++) g.mines.push({ x: m.x + rand(-34, 34), y: m.y + rand(-34, 34), arm: 0.25, r: 7, small: true }); }
        m.dead = true; break;
      }
    }
  }

  // --- 衝撃波リング（ノヴァ・爆発）の拡大と当たり ---
  for (const s of g.shocks) {
    s.r += s.vr * dt;
    s.life -= dt;
    if (s.dmg > 0) {
      for (const e of g.enemies) {
        if (e.dead) continue;
        if (s.hitSet.has(e)) continue;
        const dd = Math.hypot(e.x - s.x, e.y - s.y);
        if (dd < s.r + e.r && dd > s.r - 30) {
          let nx = (e.x - s.x) / (dd || 1), ny = (e.y - s.y) / (dd || 1);
          damageEnemy(e, s.dmg, nx * 220, ny * 220, false);
          s.hitSet.add(e);
        }
      }
    }
  }

  // --- プレイヤーの弾 ---
  for (const b of g.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (dist2(b.x, b.y, e.x, e.y) < (e.r + b.r) * (e.r + b.r)) {
        if (b.hitSet && b.hitSet.has(e)) continue;
        damageEnemy(e, b.dmg, b.vx * 0.25, b.vy * 0.25, true);
        Sound.hit();
        if (b.pierce > 0) { b.pierce--; if (!b.hitSet) b.hitSet = new Set(); b.hitSet.add(e); }
        else { b.life = 0; break; }
      }
    }
  }

  // --- 敵の弾 ---
  for (const b of g.enemyBullets) {
    // タイムフリーズ中は敵弾も空中で停止する
    if (g.freezeT <= 0) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
    }
    if (p.invuln <= 0 && dist2(b.x, b.y, p.x, p.y) < (p.r + b.r) * (p.r + b.r)) {
      hurtPlayer(b.dmg); b.life = 0;
      if (p.hp <= 0) return false;
    }
  }

  // --- 落雷の描画ライン寿命 ---
  for (const z of g.bolts) z.life -= dt;
  return true;
}

// XPジェム・回復オーブ・宝箱の吸引と回収
function updatePickups(dt) {
  const g = game, p = g.player;
  // --- XPジェムの吸引と回収 ---
  for (const gem of g.gems) {
    const dd = dist2(gem.x, gem.y, p.x, p.y);
    if (dd < p.pickupRange * p.pickupRange) {
      let dx = p.x - gem.x, dy = p.y - gem.y; const dl = Math.hypot(dx, dy) || 1;
      gem.vx += (dx / dl) * 900 * dt; gem.vy += (dy / dl) * 900 * dt;
    }
    gem.x += gem.vx * dt; gem.y += gem.vy * dt;
    gem.vx *= 0.9; gem.vy *= 0.9;
    if (dd < (p.r + 10) * (p.r + 10)) {
      gem.dead = true; gainXP(gem.value); Sound.pick();
      // 回収時に小さなスパーク（Cycle13）
      burst(gem.x, gem.y, gem.big ? '#b6ffce' : '#6bff9e', gem.big ? 6 : 3, 70);
    }
  }

  // --- ヘルスオーブ（移動・吸引・回収） ---
  const orbPullRange = p.hp / p.maxHp < 0.30 ? p.pickupRange * 2.5 : p.pickupRange;
  for (const orb of g.healthOrbs) {
    const dd = dist2(orb.x, orb.y, p.x, p.y);
    if (dd < orbPullRange * orbPullRange) {
      let dx2 = p.x - orb.x, dy2 = p.y - orb.y; const dl = Math.hypot(dx2, dy2) || 1;
      orb.vx += (dx2 / dl) * 700 * dt; orb.vy += (dy2 / dl) * 700 * dt;
    }
    orb.x += orb.vx * dt; orb.y += orb.vy * dt;
    orb.vx *= 0.88; orb.vy *= 0.88;
    if (dd < (p.r + orb.r) * (p.r + orb.r)) {
      orb.dead = true;
      const gained = Math.min(orb.value, p.maxHp - p.hp);
      p.hp = Math.min(p.maxHp, p.hp + orb.value);
      if (gained > 0) floatText(p.x, p.y - 30, '+' + gained + ' HP', '#ff8ab3', 18);
      Sound.orbHeal();
    }
  }

  // --- 宝箱（歩いて触れると開く。吸引はされない＝取りに行く楽しみ。Cycle26） ---
  for (const ch of g.chests) {
    ch.t += dt;
    if (dist2(ch.x, ch.y, p.x, p.y) < (p.r + ch.r + 8) * (p.r + ch.r + 8)) {
      ch.dead = true;
      openChest(ch);
    }
  }
}

// 爆撃の爆弾（予告円）：導火線が切れたら爆発。範囲内のプレイヤーにダメージ
function updateBombs(dt) {
  const g = game, p = g.player;
  for (const b of g.bombs) {
    b.t -= dt;
    if (b.t <= 0) {
      burst(b.x, b.y, '#ff7b3d', 16, 220);
      // dmg:0 の衝撃波は敵に当たらない＝見た目だけの爆風リング
      g.shocks.push({ x: b.x, y: b.y, r: 12, vr: 320, life: b.r / 320, maxR: b.r, dmg: 0, color: '#ff9b3d', hitSet: new Set() });
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + p.r * 0.4) hurtPlayer(b.dmg);
      shake(5);
    }
  }
}

// パーティクルと浮き文字の移動・寿命
function updateFx(dt) {
  const g = game;
  for (const pt of g.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.92; pt.vy *= 0.92; pt.life -= dt; }
  for (const tx of g.texts) { tx.y += tx.vy * dt; tx.vy *= 0.92; tx.life -= dt; }
}

// 寿命が尽きた・死んだものを配列から取り除く
function removeDeadEntities() {
  const g = game, p = g.player;
  g.enemies = g.enemies.filter(e => !e.dead);
  g.bullets = g.bullets.filter(b => b.life > 0);
  g.enemyBullets = g.enemyBullets.filter(b => b.life > 0 && dist2(b.x, b.y, p.x, p.y) < DESPAWN_R * DESPAWN_R);
  g.gems = g.gems.filter(x => !x.dead);
  g.mines = g.mines.filter(m => !m.dead && dist2(m.x, m.y, p.x, p.y) < DESPAWN_R * DESPAWN_R);
  g.shocks = g.shocks.filter(s => s.life > 0);
  g.bombs = g.bombs.filter(b => b.t > 0);
  g.bolts = g.bolts.filter(z => z.life > 0);
  g.particles = g.particles.filter(x => x.life > 0);
  g.texts = g.texts.filter(x => x.life > 0);
  g.healthOrbs = g.healthOrbs.filter(o => !o.dead && dist2(o.x, o.y, p.x, p.y) < DESPAWN_R * DESPAWN_R);
  g.chests = g.chests.filter(c => !c.dead); // 宝箱は遠くても消さない（レーダーで戻れる）
}

// 敵の移動（種類ごとの動き方＋減速・凍結）
function moveEnemy(e, dt, dx, dy, d, p) {
  // ノックバック（共通）
  e.x += e.knock.x * dt; e.y += e.knock.y * dt;
  e.knock.x *= 0.86; e.knock.y *= 0.86;
  // 凍結中は動かない
  if (e.freezeT > 0) { e.freezeT -= dt; return; }
  // 減速
  let spd = e.speed;
  if (e.slowT > 0) { e.slowT -= dt; spd *= (e.slowF || 0.5); }

  const mv = e.move;
  if (mv === 'flee') {
    // 逃走（ゴールデンランナー用）：プレイヤーから遠ざかりつつ蛇行（Cycle29）
    const px = -dy, py = dx;
    const wob = Math.sin(game.time * 4 + e.seed) * 0.8;
    e.x += (-dx + px * wob) * spd * dt;
    e.y += (-dy + py * wob) * spd * dt;
    // 赤枠（アリーナ境界）の外へは逃げられない：境界で押し戻して追える範囲に留める
    const ed = Math.hypot(e.x, e.y);
    if (ed > ARENA_R - e.r) { const sc = (ARENA_R - e.r) / ed; e.x *= sc; e.y *= sc; }
  } else if (mv === 'weave') {
    // 直進方向に対して垂直方向へsin揺れ（蛇行で避けにくい）
    const px = -dy, py = dx;
    const wob = Math.sin(game.time * 5 + e.seed) * 0.7;
    e.x += (dx + px * wob) * spd * dt;
    e.y += (dy + py * wob) * spd * dt;
  } else if (mv === 'dash') {
    // 普段は遅い→近づくとためて高速突進
    if (e.ds === 'charge') {
      e.dsT -= dt; // ためモーション（ほぼ停止）
      if (e.dsT <= 0) { e.ds = 'dash'; e.dsT = 0.3; const sp = 540 * (e.slowT > 0 ? 0.6 : 1); e.dvx = dx * sp; e.dvy = dy * sp; }
    } else if (e.ds === 'dash') {
      e.dsT -= dt; e.x += e.dvx * dt; e.y += e.dvy * dt;
      if (e.dsT <= 0) { e.ds = 'cool'; e.dsT = rand(1.3, 2.1); }
    } else {
      e.x += dx * spd * 0.55 * dt; e.y += dy * spd * 0.55 * dt; // 普段はゆっくり接近
      e.dsT = (e.dsT === undefined ? rand(0.8, 1.8) : e.dsT) - dt;
      if (e.dsT <= 0 && d < 340) { e.ds = 'charge'; e.dsT = 0.45; }
    }
  } else if (mv === 'orbit') {
    // 一定距離（ringR）を保ちながら横移動（旋回）。遠ければ寄り、近すぎれば離れる
    const ringR = 210;
    const tx = -dy, ty = dx;                       // プレイヤー方向に対する接線
    const radial = clamp((d - ringR) / 120, -1, 1); // +で接近・−で後退
    const sign = e.seed > Math.PI ? 1 : -1;         // 個体ごとに旋回の向きを変える
    e.x += (tx * sign * 0.95 + dx * radial * 0.7) * spd * dt;
    e.y += (ty * sign * 0.95 + dy * radial * 0.7) * spd * dt;
  } else if (mv === 'bomb') {
    e.x += dx * spd * dt; e.y += dy * spd * dt;
    // 近づくと導火→爆発（自分も消える。周囲の敵も巻き込む＝乱戦が気持ちいい）
    if (e.fuse < 0 && d < e.r + p.r + 26) { e.fuse = 0.55; }
    if (e.fuse >= 0) {
      e.fuse -= dt;
      if (e.fuse <= 0) {
        const rad = e.r + 64;
        explode(e.x, e.y, rad, 0, '#ff7b3d');
        if (dist2(e.x, e.y, p.x, p.y) < rad * rad && p.invuln <= 0) hurtPlayer(e.dmg);
        for (const o of game.enemies) { if (o !== e && !o.dead && dist2(e.x, e.y, o.x, o.y) < rad * rad) damageEnemy(o, e.maxHp * 0.6, 0, 0, false); }
        e.dead = true; shake(8);
      }
    }
  } else {
    // chase（直進）。ただしbruteが叩きつけの予告/着地中は静止する（狙いを外させないため）
    if (e.kind === 'brute' && (e.slamWarn || 0) > 0) { /* 静止 */ }
    else { e.x += dx * spd * dt; e.y += dy * spd * dt; }
  }
}

// brute専用：接近して溜め→地面叩きつけで周囲に衝撃波（近接オンリーだったbruteに固有攻撃を付与）
function updateBruteSlam(e, dt, d, p) {
  if ((e.slamWarn || 0) > 0) {
    e.slamWarn -= dt;
    if (e.slamWarn <= 0) {
      const rad = e.r + 66;
      explode(e.x, e.y, rad, 0, '#ff5c3d');
      if (dist2(e.x, e.y, p.x, p.y) < rad * rad && p.invuln <= 0) hurtPlayer(Math.round(e.dmg * 1.3));
      e.atkCd = rand(2.8, 4.0);
      shake(6);
    }
    return;
  }
  e.atkCd -= dt;
  if (e.atkCd <= 0 && d < e.r + 100) {
    e.slamWarn = 0.6;
  }
}

// ---- 敵スポーン処理（ウェーブ・ミニボス・ラスボス） ----
function updateSpawning(dt) {
  const g = game, p = g.player;

  // 敵の数は経過時間でじわじわ増える
  const cap = Math.min(70, 22 + Math.floor(g.time / 75) * 2);

  g.spawnTimer -= dt;
  const hasBoss = g.enemies.some(e => !e.dead && (e.boss || e.kind === 'miniboss'));
  const baseInterval = Math.max(0.20, (1.10 - g.time * 0.011));
  // ボス戦中はモブを絞る（ボスが目立つように）
  const interval = hasBoss ? Math.max(4.0, baseInterval * 6) : baseInterval;
  if (g.spawnTimer <= 0 && g.enemies.length < cap) {
    g.spawnTimer = interval;
    const wave = g.wave;
    const kind = pickSpawnKind(wave);
    // wave3以降（time>270秒）は底上げして後半に確実にeliteが混じる
    const eliteBase = g.wave >= 3 ? 0.10 : 0;
    const eliteChance = clamp(eliteBase + (g.time - 150) / 700, 0, 0.40);
    const isElite = Math.random() < eliteChance;
    spawnEnemy(kind, { elite: isElite });
    // エリート登場バナー（Cycle19）：10秒に1回まで通知
    if (isElite) {
      if (g.lastEliteBanner > 10) {
        setBanner('⚡ ELITE!', kind.toUpperCase() + ' が現れた', '#ffd23f');
        g.screenFlash = { color: '#ffd23f', life: 0.3, max: 0.3 };
        g.lastEliteBanner = 0;
      }
    }
    const extra = Math.min(1, Math.floor(g.time / 180));
    if (extra > 0 && g.enemies.length < cap && Math.random() < 0.4) spawnEnemy(pickSpawnKind(wave));
  }

  // 群れスポーン（ボス戦中は出さない）：wave2以降、30〜60秒間隔で4〜6体が一塊で出現
  if (g.time > 90 && g.hordeCd <= 0 && !hasBoss) {
    g.hordeCd = 30 + Math.random() * 30;
    const wave = g.wave;
    const kind = pickSpawnKind(wave);
    const count = 4 + Math.floor(Math.random() * 3);
    const ang = Math.random() * TAU, rad = 580;
    const bx = p.x + Math.cos(ang) * rad, by = p.y + Math.sin(ang) * rad;
    for (let i = 0; i < count; i++) {
      spawnEnemy(kind, { x: bx + rand(-40, 40), y: by + rand(-40, 40) });
    }
    g.hordeArrow = { angle: ang, life: 4.0 };
    setBanner('HORDE!', kind.toUpperCase() + ' ×' + count, '#ff9b3d');
  }
  if (g.hordeCd > 0) g.hordeCd -= dt;

  // ミニボス（ウェーブ境界で出現。種類をローテして固有攻撃を見せる）
  if (g.time >= g.miniBossAt && g.time < CLEAR_TIME) {
    // ローテはスキル入手ペースに合わせる（ユーザー要望）：
    // 1匹目=弾幕型（まだダッシュ未入手→歩いて避けられるリングのみ）、2匹目=突進型（ダッシュ必須）、
    // 3匹目=爆撃型（範囲外へ移動 or ダッシュ）、4匹目=瞬移型、5匹目=狙撃型（5種ローテで使い回し感を無くす・ユーザー要望）
    const types = ['spreader', 'charger', 'bomber', 'blinker', 'sniper'];
    const bt = types[g.miniBossCount % types.length];
    const names = { spreader: '弾幕型', charger: '突進型', bomber: '爆撃型', blinker: '瞬移型', sniper: '狙撃型' };
    const bossColors = { spreader: '#00d4ff', charger: '#ff4444', bomber: '#ff9b3d', blinker: '#ffcc00', sniper: '#39ff14' };
    const mb = spawnEnemy('miniboss', { bossType: bt });
    // プレイヤーレベルで補正（火力インフレに対抗）＋タイプ別カラー設定
    if (mb) {
      const mbLvScale = 1 + Math.max(0, p.level - 6) * 0.08;
      mb.hp = Math.round(mb.hp * mbLvScale); mb.maxHp = mb.hp;
      mb.color = bossColors[bt] || '#4be0ff';
      if (bt === 'charger') { mb.r = 55; } // 突進型は0.8倍サイズ・移動速度は通常のまま（突進時のみ高速・ユーザー要望）
      if (bt === 'sniper') { mb.move = 'orbit'; } // 狙撃型は一定距離を保って旋回しつつ狙い撃つ
    }
    g.miniBossCount++;
    g.miniBossAt += WAVE_LEN;
    setBanner('MINI BOSS', names[bt] + 'の強敵が現れた！', bossColors[bt] || '#4be0ff');
    floatText(p.x, p.y - 40, 'MINI BOSS!', bossColors[bt] || '#4be0ff', true);
    Sound.boss(); shake(12);
    g.screenFlash = { color: bossColors[bt] || '#4be0ff', life: 0.7, max: 0.7 };
  }

  // ラスボス（規定時間で1回）
  if (!g.finalBossSpawned && g.time >= CLEAR_TIME) {
    spawnFinalBoss();
  }
}


function spawnFinalBoss() {
  const g = game, p = g.player;
  g.finalBossSpawned = true;
  const ang = Math.random() * TAU, rad = 420;
  // プレイヤーのレベルが高いほどボスも強くなる（火力インフレ対策）
  const lvScale = 1 + Math.max(0, p.level - 8) * 0.09;
  const hpBase = 16900 * lvScale; // ボスHP 1.3倍（ユーザー要望）
  const bx = p.x + Math.cos(ang) * rad, by = p.y + Math.sin(ang) * rad;
  const e = {
    kind: 'boss', boss: true, bossType: 'overlord',
    x: bx, y: by,
    hp: hpBase, maxHp: hpBase,
    speed: 67, r: 72, dmg: 72, xp: 2000, color: '#ff4be0', // 移動0.8倍・サイズ1.5倍・攻撃力0.8倍（ユーザー要望）
    shape: 'boss', move: 'chase', hitFlash: 0, fireTimer: 1.0, atkCd: 1.2, knock: { x: 0, y: 0 },
    slowT: 0, freezeT: 0, elite: false, spawnFx: 1.2, // 登場演出タイマー（もっとラスボス感・ユーザー要望）
    // コアフェーズ：HP65%/35%を切るたびに1回ずつ無敵化＋アリーナ侵食（Core Keeper参考）
    coreThresholds: [0.65, 0.35], coreNextIdx: 0, coreInvuln: false, coreExposed: 0,
  };
  g.enemies.push(e);
  g.bossRef = e;
  g.screenFlash = { color: '#ff2d90', life: 0.6, max: 0.6 };
  burst(bx, by, '#ff4be0', 60, 380);
  setBanner('!! FINAL BOSS !!', '弾幕・突進・爆撃・瞬移を操る支配者', '#ff4be0');
  floatText(p.x, p.y - 50, 'FINAL BOSS', '#ff4be0', true);
  Sound.boss(); shake(30);
}

function onBossDefeated() {
  const g = game;
  // 大爆発 + 白フラッシュ
  burst(g.player.x, g.player.y, '#ffffff', 40, 400);
  g.screenFlash = { color: '#ffffff', life: 0.5, max: 0.5 };
  shake(16);
  winGame();
}

// 全方位リング弾（ボスの弾幕用）
function enemyRing(e, n, speed, dmg, color) {
  const base = Math.random() * TAU;
  for (let i = 0; i < n; i++) {
    const a = base + TAU / n * i;
    game.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 8, dmg, life: 4.5, color });
  }
}

// 包囲リング：プレイヤーを取り囲む弾の輪が縮んでくる（スキルのダッシュ/テレポートで抜けるのが前提の攻撃）
function enemyCage(px, py, n, radius, speed, dmg, color) {
  const base = Math.random() * TAU;
  for (let i = 0; i < n; i++) {
    const a = base + TAU / n * i;
    game.enemyBullets.push({
      x: px + Math.cos(a) * radius, y: py + Math.sin(a) * radius,
      vx: -Math.cos(a) * speed, vy: -Math.sin(a) * speed,
      r: 8, dmg, life: (radius * 2) / speed, color,
    });
  }
}

// コアフェーズ開始：無敵化し、進行中の技をキャンセルしてアリーナ侵食フィールドを展開する
function startCorePhase(e) {
  const g = game;
  e.coreInvuln = true;
  e.coreNextIdx++;
  // 突進・瞬移・ストンプの予兆中だった場合はキャンセル（フェーズ開始と技が重ならないように）
  e.chargeWarn = 0; e.chargeT = 0; e.warpTimer = 0; e.warpTarget = null; e.stompWarn = 0;
  g.voidPhase = { boss: e, timer: 6.5, max: 6.5, shuffleT: 0, zones: [], grace: 0 };
  shuffleVoidZones(g.voidPhase);
  g.voidPhase.grace = 1.2; // フェーズ開始直後は猶予（安全地帯を確認する時間・ユーザー要望）
  setBanner('侵食フェーズ', '安全地帯の光る円以外はダメージ床！耐えきれば隙ができる', '#7dffdc');
  floatText(e.x, e.y - e.r - 10, '無敵化!', '#7dffdc', true);
  Sound.overdrive(); shake(14);
}

// 安全地帯を3つ、アリーナ内のランダムな位置へ再配置する
function shuffleVoidZones(vp) {
  const n = 3;
  const zones = [];
  const base = Math.random() * TAU;
  for (let i = 0; i < n; i++) {
    const ang = base + (TAU / n) * i + rand(-0.35, 0.35);
    const rad = rand(220, ARENA_R - 160);
    zones.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, r: 110 });
  }
  vp.zones = zones;
  vp.shuffleT = 2.6;   // シャッフル間隔を延長（移動が間に合うように・ユーザー要望）
  vp.grace = 0.5;       // 切り替わり直後も少し猶予を挟む
  Sound.zap();
}

// コアフェーズ終了：無敵解除＋一定時間「隙」を晒して被ダメを増加させる
function endCorePhase(e) {
  const g = game;
  e.coreInvuln = false;
  e.coreExposed = 4.0; // このあいだ被ダメ1.6倍（damageEnemyで参照）
  g.voidPhase = null;
  setBanner('隙だらけ!', '今が攻めどき！被ダメージが増えている', '#ffe066');
  floatText(e.x, e.y - e.r - 10, 'チャンス!', '#ffe066', true);
  Sound.boss(); shake(10);
}

// コアフェーズの毎フレーム処理（タイマー・シャッフル・安全地帯外ダメージ）。main update側から呼ばれる
function updateVoidPhase(dt) {
  const g = game, vp = g.voidPhase;
  if (!vp) return;
  if (vp.boss.dead) { g.voidPhase = null; return; }
  vp.timer -= dt;
  vp.shuffleT -= dt;
  if (vp.grace > 0) vp.grace -= dt; // 猶予中は安全地帯外でもダメージなし（ユーザー要望）
  if (vp.shuffleT <= 0 && vp.timer > 0.6) shuffleVoidZones(vp); // 終了間際はシャッフルしない（着地を安定させる）
  if (vp.timer <= 0) { endCorePhase(vp.boss); return; }
  const p = g.player;
  let safe = false;
  for (const z of vp.zones) {
    if (dist2(p.x, p.y, z.x, z.y) < z.r * z.r) { safe = true; break; }
  }
  if (!safe && vp.grace <= 0 && p.invuln <= 0) hurtPlayer(70);
}

// ボス・ミニボスの固有攻撃
function updateBossBehavior(e, dt, dx, dy, d) {
  const g = game;
  e.atkCd = (e.atkCd || 0) - dt;
  if (e.coreExposed > 0) e.coreExposed -= dt; // コアフェーズ明けの「隙」タイマー
  if (e.spawnFx > 0) e.spawnFx -= dt; // 登場演出タイマー
  // ストンプ予告タイマー（overlordの踏みつけ攻撃）
  if ((e.stompWarn || 0) > 0) {
    e.stompWarn -= dt;
    if (e.stompWarn <= 0) {
      // 予告終了→その座標に爆発
      const fake = { x: e.stompX, y: e.stompY, color: '#ff2200' };
      enemyRing(fake, 24, 260, 48, '#ff2200');
      burst(e.stompX, e.stompY, '#ff4400', 24, 200);
      // プレイヤーが範囲内にいたらダメージ（攻撃力0.8倍・ユーザー要望）
      if (Math.hypot(g.player.x - e.stompX, g.player.y - e.stompY) < 90) hurtPlayer(80);
      shake(12);
    }
  }
  const bt = e.bossType;
  if (bt === 'spreader') {
    // 1匹目のボス：ダッシュ未入手でも歩いて避けられる全方位リングのみ（包囲はやらない・ユーザー要望）
    if (e.atkCd <= 0 && d < 620) {
      enemyRing(e, 12, 205, 22, '#4be0ff');
      e.atkCd = 2.6;
    }
  } else if (bt === 'charger') {
    // 2秒のタメ→発射の瞬間に狙いを定めて長距離突進（プレイヤーを通り過ぎるまで走る・ユーザー要望）
    // 発動間隔8秒＝スキルCD（最大6秒）より長いので、毎回ダッシュで確実にかわせる設計
    if (e.chargeWarn > 0) {
      e.chargeWarn -= dt;
      e.hitFlash = 0.06; // 赤くする（hitFlashを流用）
      if (e.chargeWarn <= 0) { // 予兆終了→この瞬間のプレイヤー位置に照準して突進（歩き回避を許さない）
        e.chargeT = 1.5; e.cvx = dx * 420; e.cvy = dy * 420; // 速度420=初期プレイヤー速度210の2倍（ユーザー要望）
        burst(e.x, e.y, '#ff3030', 18, 220);
        shake(6);
      }
    } else if (e.chargeT > 0) { e.chargeT -= dt; e.x += e.cvx * dt; e.y += e.cvy * dt; }
    else if (e.atkCd <= 0 && d < 620) {
      // 予兆開始（2秒タメてから突進・ユーザー要望）
      e.chargeWarn = 2.0; e.atkCd = 8.0;
      floatText(e.x, e.y - e.r, '⚠ 突進!', '#ff4444');
      shake(4);
    }
  } else if (bt === 'bomber') {
    // 爆撃型：プレイヤー周辺の複数地点に予告円を出し、時間差で爆弾の雨を降らせる（円の外へ移動して回避）
    if (e.atkCd <= 0) {
      for (let k = 0; k < 9; k++) {
        const ang = Math.random() * TAU, rr = Math.sqrt(Math.random()) * 190;
        const fuse = 0.9 + k * 0.13;
        g.bombs.push({ x: g.player.x + Math.cos(ang) * rr, y: g.player.y + Math.sin(ang) * rr, t: fuse, max: fuse, r: 78, dmg: 44 });
      }
      floatText(e.x, e.y - e.r, '💣 爆撃!', '#ff9b3d');
      e.atkCd = 4.5;
    }
  } else if (bt === 'blinker') {
    // 予告フェーズ：ワープ先に0.7秒間警告マーカーを表示してから実際に移動
    if (e.warpTimer > 0) {
      e.warpTimer -= dt;
      if (e.warpTimer <= 0) {
        // 予告終了→実際にワープ
        burst(e.x, e.y, '#c78bff', 16, 220);
        e.x = e.warpTarget.x; e.y = e.warpTarget.y;
        burst(e.x, e.y, '#c78bff', 22, 260);
        enemyRing(e, 18, 235, 26, '#c78bff');
        floatText(e.x, e.y - e.r, 'ブリンク!', '#c78bff');
        e.warpTarget = null;
        e.atkCd = 2.6;
      }
    } else if (e.atkCd <= 0) {
      // 予告開始：0.7秒後にワープする先を決定して表示
      const ang = Math.random() * TAU, rr = 130;
      e.warpTarget = { x: g.player.x + Math.cos(ang) * rr, y: g.player.y + Math.sin(ang) * rr };
      e.warpTimer = 0.7;
      floatText(e.warpTarget.x, e.warpTarget.y - 20, '⚠', '#ffff00');
    }
  } else if (bt === 'sniper') {
    // 狙撃型：距離を保って旋回しながら、丸い弾幕ではなく狙い澄ました単発弾を連続で撃ってくる（ユーザー要望）
    if ((e.sniperBurst || 0) > 0) {
      e.sniperBurst -= dt;
      if (e.sniperBurst <= 0) {
        const ang = Math.atan2(g.player.y - e.y, g.player.x - e.x);
        game.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 430, vy: Math.sin(ang) * 430, r: 6, dmg: 24, life: 3, color: '#39ff14' });
        e.sniperShots--;
        e.sniperBurst = e.sniperShots > 0 ? 0.26 : 0;
        if (e.sniperShots <= 0) e.atkCd = 2.3;
      }
    } else if (e.atkCd <= 0 && d < 640) {
      e.sniperShots = 4; e.sniperBurst = 0.4; // 0.4秒タメてから4連射（1発ずつ正確に狙う）
      floatText(e.x, e.y - e.r, '⚠ 照準!', '#39ff14');
    }
  } else if (bt === 'overlord') {
    // コアフェーズ：HP65%/35%を下から通過した瞬間に1回ずつ発動。無敵化してアリーナを侵食し、
    // 安全地帯以外はダメージ床になる回避フェーズ（耐えきると「隙」が生まれ攻めどきになる）
    if (!e.coreInvuln && e.coreNextIdx < e.coreThresholds.length && e.hp <= e.maxHp * e.coreThresholds[e.coreNextIdx]) {
      startCorePhase(e);
    }
    if (e.coreInvuln) return; // フェーズ中は通常の攻撃パターンを止める（安全地帯の管理はmain update側）
    // 融合ボス：ミニボス4種の技（弾幕・長距離突進・爆撃・瞬移）＋包囲弾幕をすべて使う（ユーザー要望）
    // 残りHP40%未満で「激昂」：攻撃間隔が短くなり弾幕が激しくなる（第2形態的な山場）
    const rage = e.hp < e.maxHp * 0.4;
    if (rage && !e.raged) { e.raged = true; setBanner('ENRAGED!', '支配者が激昂した', '#ff4be0'); shake(16); }
    const cdK = rage ? 0.62 : 1;
    // 長距離突進（突進型ゆずり）：予兆のあと発射の瞬間に照準
    if ((e.chargeWarn || 0) > 0) {
      e.chargeWarn -= dt;
      e.hitFlash = 0.06;
      if (e.chargeWarn <= 0) {
        const sp = rage ? 880 : 780;
        e.chargeT = 0.8; e.cvx = dx * sp; e.cvy = dy * sp;
        burst(e.x, e.y, '#ff3030', 20, 240); shake(8);
      }
    }
    if (e.chargeT > 0) { e.chargeT -= dt; e.x += e.cvx * dt; e.y += e.cvy * dt; }
    // 瞬移（瞬移型ゆずり）：予告→ワープして全方位弾
    if ((e.warpTimer || 0) > 0) {
      e.warpTimer -= dt;
      if (e.warpTimer <= 0) {
        burst(e.x, e.y, '#ff4be0', 18, 240);
        e.x = e.warpTarget.x; e.y = e.warpTarget.y;
        burst(e.x, e.y, '#ff4be0', 24, 280);
        enemyRing(e, rage ? 30 : 24, 250, 64, '#ff4be0');
        floatText(e.x, e.y - e.r, 'ブリンク!', '#ff4be0');
        e.warpTarget = null;
      }
    }
    // 突進・瞬移の予兆中は次の攻撃を選ばない（技が重ならないように）
    if (e.atkCd <= 0 && (e.chargeWarn || 0) <= 0 && (e.warpTimer || 0) <= 0) {
      const r = Math.random();
      if (r < 0.16) {
        // 扇形弾（プレイヤー追尾・横避け必須）
        const base = Math.atan2(dy, dx); const arc = rage ? 6 : 4;
        for (let i = -arc; i <= arc; i++) { const a = base + i * 0.18; g.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, r: 8, dmg: 68, life: 4, color: '#ff5ea0' }); }
        e.atkCd = 1.3 * cdK;
      } else if (r < 0.32) {
        // 全方位リング（回避必須、激昂時は2連続）
        enemyRing(e, rage ? 36 : 26, 220, 68, '#ff5ea0'); e.atkCd = 1.7 * cdK;
        if (rage) setTimeout(() => { if (!e.dead && e.hp > 0) enemyRing(e, 20, 180, 56, '#ff4be0'); }, 600);
      } else if (r < 0.44) {
        // スパイラル弾（動き続けないと必ず当たる）
        const spirals = rage ? 3 : 2;
        for (let s2 = 0; s2 < spirals; s2++) {
          const sBase = Math.atan2(dy, dx) + s2 * (TAU / spirals);
          for (let si = 0; si < 7; si++) {
            const a = sBase + si * 0.28;
            const spd = 160 + si * 22;
            g.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 7, dmg: 56, life: 5.5, color: '#ff8ab3' });
          }
        }
        floatText(e.x, e.y - e.r, 'スパイラル!', '#ff4be0'); e.atkCd = rage ? 1.4 * cdK : 2.0 * cdK;
      } else if (r < 0.58) {
        // 囲い込み弾幕：プレイヤーの周囲に弾の輪が出現し縮んでくる（ダッシュ/テレポートで脱出前提）
        enemyCage(g.player.x, g.player.y, rage ? 30 : 24, 260, rage ? 130 : 110, 64, '#ff4be0');
        floatText(g.player.x, g.player.y - 40, '⚠ 包囲!', '#ff4be0');
        e.atkCd = 2.4 * cdK;
      } else if (r < 0.72) {
        // 爆撃（爆撃型ゆずり）：プレイヤー周辺に爆弾の雨
        const nb = rage ? 13 : 10;
        for (let k = 0; k < nb; k++) {
          const ang2 = Math.random() * TAU, rr2 = Math.sqrt(Math.random()) * 210;
          const fuse = 0.85 + k * 0.11;
          g.bombs.push({ x: g.player.x + Math.cos(ang2) * rr2, y: g.player.y + Math.sin(ang2) * rr2, t: fuse, max: fuse, r: 80, dmg: 52 });
        }
        floatText(e.x, e.y - e.r, '💣 爆撃!', '#ff9b3d'); e.atkCd = 2.8 * cdK;
      } else if (r < 0.84) {
        // 長距離突進の予兆開始（0.7秒タメ→照準して発射）
        e.chargeWarn = 0.7;
        floatText(e.x, e.y - e.r, '⚠ 突進!', '#ff6b6b'); e.atkCd = 3.0 * cdK;
      } else if (r < 0.93) {
        // 瞬移の予告開始（0.7秒後にプレイヤーの至近へワープして弾幕）
        const ang3 = Math.random() * TAU;
        e.warpTarget = { x: g.player.x + Math.cos(ang3) * 150, y: g.player.y + Math.sin(ang3) * 150 };
        e.warpTimer = 0.7;
        floatText(e.warpTarget.x, e.warpTarget.y - 20, '⚠', '#ffff00');
        e.atkCd = 2.2 * cdK;
      } else {
        // ストンプ：プレイヤーの現在地に0.8秒後に爆発（赤予告円あり）
        e.stompX = g.player.x; e.stompY = g.player.y; e.stompWarn = 0.8;
        floatText(e.x, e.y - e.r, '踏みつけ!', '#ff2200'); e.atkCd = 2.2 * cdK;
      }
    }
  }
}

function fireEnemyShot(e, dx, dy) {
  if (e.kind === 'orbiter') {
    // orbiter：旋回しながら3方向へ拡散する紫のエネルギー弾（総ダメージは単発時と揃うよう1発ずつ軽め）
    const spread = 0.30;
    for (const ang of [-spread, 0, spread]) {
      const cs = Math.cos(ang), sn = Math.sin(ang);
      const ndx = dx * cs - dy * sn, ndy = dx * sn + dy * cs;
      game.enemyBullets.push({ x: e.x, y: e.y, vx: ndx * 195, vy: ndy * 195, r: 7, dmg: Math.round(e.dmg * 0.6), life: 4, color: '#a04bff', kind: 'orbiter', spin: rand(0, TAU) });
    }
  } else {
    // spitter：涙滴型の一点集中ショット（威力そのまま・速度アップで避けにくく）
    game.enemyBullets.push({ x: e.x, y: e.y, vx: dx * 250, vy: dy * 250, r: 8, dmg: e.dmg, life: 4, color: '#ff9b3d', kind: 'spitter' });
  }
}

function hurtPlayer(dmg) {
  const p = game.player;
  // 回避：確率で被弾を完全無効化（短い無敵も付けて連続回避を成立させる）
  if (p.dodge > 0 && Math.random() < p.dodge) {
    p.invuln = 0.35;
    floatText(p.x, p.y - 20, 'MISS', '#5cf0ff');
    return;
  }
  // バリア：充電完了時は被弾1回を無効化（Cycle14）
  if (p.barrierActive && p.barrierCharge >= 20) {
    p.barrierCharge = 0;
    p.invuln = 0.4;
    floatText(p.x, p.y - 20, 'BLOCKED!', '#88aaff');
    shake(4);
    return;
  }
  dmg = Math.max(1, Math.round(dmg * (1 - p.armor)));
  p.hp -= dmg;
  p.invuln = 1.0; // 被弾後の無敵時間1秒
  p.hurtFlash = 1.0; // 画面端の赤フラッシュ用（無敵時間とは別管理。バリア等の長い無敵で真っ赤にならないように）
  p.regenDelay = 2.5;
  shake(8); Sound.hurt();
  floatText(p.x, p.y - 20, '-' + dmg, '#ff6b6b');
  if (p.hp <= 0) {
    if (GODMODE) { p.hp = p.maxHp; }
    else if (p.deathDefyLv > 0) {
      // 死の免除: 一度だけ致死ダメージを1HPで生き残る
      p.deathDefyLv = 0; p.deathDefied = true; p.hp = 1; p.invuln = 2;
      burst(p.x, p.y, '#ff4b4b', 30, 320);
      setBanner('⚰ 死の免除発動！', '致死ダメージを耐えた！', '#ff4b4b');
      floatText(p.x, p.y - 60, '⚰ SURVIVE!', '#ff4b4b', true);
      Sound.revive();
    } else { p.hp = 0; gameOver(); }
  }
}

function nearestEnemy(x, y, exclude) {
  let best = null, bd = Infinity;
  for (const e of game.enemies) {
    if (e.dead) continue;
    if (exclude && exclude.has(e)) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function separateEnemies() {
  const es = game.enemies;
  for (let i = 0; i < es.length; i++) {
    for (let j = i + 1; j < es.length; j++) {
      const a = es[i], b = es[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const minD = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD * minD && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const overlap = (minD - d) / 2;
        const ux = dx / d, uy = dy / d;
        const aw = a.boss ? 0.1 : 1, bw = b.boss ? 0.1 : 1;
        a.x -= ux * overlap * aw; a.y -= uy * overlap * aw;
        b.x += ux * overlap * bw; b.y += uy * overlap * bw;
      }
    }
  }
}

// ---- 各武器 ----
// =========================================================================
//  武器の自動攻撃
// =========================================================================
// 武器の実ダメージ（プレイヤーの攻撃力倍率込み）
function weaponDmg(w) {
  return w.dmg * game.player.dmgMul;
}

function updateBolt(dt) {
  const w = game.player.weapons.bolt, p = game.player;
  w.cd -= dt;
  if (w.cd > 0) return;
  const target = nearestEnemy(p.x, p.y);
  if (!target) { w.cd = 0.05; return; }
  w.cd = w.interval;
  let baseAng = Math.atan2(target.y - p.y, target.x - p.x);
  const n = w.count;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * w.spread;
    const a = baseAng + off;
    game.bullets.push({
      x: p.x, y: p.y, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
      r: w.evolved ? 7 : 5, dmg: weaponDmg(w), life: 1.1, pierce: w.pierce, kind: 'bolt',
      // dmgMulが高いほど橙→赤に変化（Cycle9）
      color: w.evolved ? '#ffd23f' : (p.dmgMul > 1.5 ? '#ff6b3d' : p.dmgMul > 1.25 ? '#ffa33d' : '#ffe34d'),
    });
  }
  Sound.shoot();
}

function updateOrbit(dt) {
  const w = game.player.weapons.orbit, p = game.player;
  if (w.lv <= 0) return;
  w.angle += w.rotSpeed * dt;
  w.cd -= dt;
  const canHit = w.cd <= 0;
  const hitR = w.evolved ? 15 : 11;
  for (let i = 0; i < w.count; i++) {
    const a = w.angle + (TAU / w.count) * i;
    const ox = p.x + Math.cos(a) * w.radius;
    const oy = p.y + Math.sin(a) * w.radius;
    if (canHit) {
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (dist2(ox, oy, e.x, e.y) < (e.r + hitR) * (e.r + hitR)) {
          damageEnemy(e, weaponDmg(w), Math.cos(a) * 80, Math.sin(a) * 80, false);
          burst(ox, oy, '#9fe8ff', 3, 120);
        }
      }
    }
  }
  if (canHit) w.cd = w.evolved ? 0.16 : 0.22;
}

function updateNova(dt) {
  const w = game.player.weapons.nova, p = game.player;
  if (w.lv <= 0) return;
  w.cd -= dt;
  if (w.cd > 0) return;
  w.cd = w.interval;
  game.shocks.push({ x: p.x, y: p.y, r: 18, vr: w.speed, life: w.radius / w.speed, maxR: w.radius,
    dmg: weaponDmg(w), color: w.evolved ? '#ff4be0' : '#b86bff', hitSet: new Set() });
  Sound.nova();
  if (w.evolved) shake(6);
}

function updateThunder(dt) {
  const w = game.player.weapons.thunder, p = game.player;
  if (w.lv <= 0) return;
  w.cd -= dt;
  if (w.cd > 0) return;
  const first = nearestEnemy(p.x, p.y);
  if (!first) { w.cd = 0.1; return; }
  w.cd = w.interval;
  const hit = new Set();
  let cur = first, fromX = p.x, fromY = p.y;
  for (let i = 0; i < w.chains && cur; i++) {
    damageEnemy(cur, weaponDmg(w), 0, 0, false);
    hit.add(cur);
    game.bolts.push({ x1: fromX, y1: fromY, x2: cur.x, y2: cur.y, life: 0.18, max: 0.18, color: w.evolved ? '#c78bff' : '#cfe8ff' });
    burst(cur.x, cur.y, '#9fe8ff', 4, 140);
    fromX = cur.x; fromY = cur.y;
    let nx = null, nd = w.range * w.range;
    for (const e of game.enemies) {
      if (e.dead || hit.has(e)) continue;
      const dd = dist2(cur.x, cur.y, e.x, e.y);
      if (dd < nd) { nd = dd; nx = e; }
    }
    cur = nx;
  }
  Sound.zap();
}

function updateFrost(dt) {
  const w = game.player.weapons.frost, p = game.player;
  if (w.lv <= 0) return;
  w.cd -= dt;
  if (w.cd > 0) return;
  w.cd = w.tick;
  for (const e of game.enemies) {
    if (e.dead || e.boss) continue; // ボスは凍らせない
    if (dist2(p.x, p.y, e.x, e.y) < (w.radius + e.r) * (w.radius + e.r)) {
      damageEnemy(e, weaponDmg(w), 0, 0, false);
      e.slowT = 0.7; e.slowF = w.slow;
      if (w.evolved && Math.random() < 0.05 && e.kind !== 'miniboss') e.freezeT = 0.9; // 進化：時々完全凍結
    }
  }
}

function updateMine(dt) {
  const w = game.player.weapons.mine, p = game.player;
  if (w.lv <= 0) return;
  w.cd -= dt;
  if (w.cd > 0) return;
  w.cd = w.interval;
  // 通常地雷の数（子地雷は数に含めない）が上限未満なら設置
  let n = 0; for (const m of game.mines) if (!m.small) n++;
  if (n < w.max) game.mines.push({ x: p.x + rand(-22, 22), y: p.y + rand(-22, 22), arm: 0.3, r: 10 });
}

function gameOver() {
  state = 'gameover';
  // 死亡回数を積み上げる（このラン内＋通算。通算はブラウザに保存）
  game.deaths++;
  totalDeaths++;
  try { localStorage.setItem('neon_survivor_deaths', String(totalDeaths)); } catch (e) {}
  game.finalScore = computeScore();
  if (game.finalScore > best) {
    best = game.finalScore; game.newBest = true;
    try { localStorage.setItem('neon_survivor_best', String(best)); } catch (e) {}
  }
  shake(18);
  burst(game.player.x, game.player.y, '#ff6b6b', 40, 320);
}

function winGame() {
  state = 'win';
  game.finalScore = computeScore() + 5000;
  if (game.finalScore > best) {
    best = game.finalScore; game.newBest = true;
    try { localStorage.setItem('neon_survivor_best', String(best)); } catch (e) {}
  }
  shake(22);
  burst(game.player.x, game.player.y, '#8affc1', 60, 360);
  Sound.win();
}

function computeScore() {
  const p = game.player;
  // キル × レベル係数（高レベルほど1キルが重い）
  const killScore = game.kills * 12 * (1 + Math.log(Math.max(1, p.level)) / 3);
  return Math.floor(game.time * 10 + killScore);
}

// コンティニュー：死んだその場から再開できる（死亡回数は積み上がる）
function continueRun() {
  if (state !== 'gameover' || !game) return;
  const g = game, p = g.player;
  p.hp = p.maxHp;
  p.invuln = 3;        // 再開直後の即死防止（3秒無敵）
  p.dashCd = 0;
  g.enemyBullets.length = 0; // 周囲の敵弾を消す
  g.bombs.length = 0;        // 設置済みの爆弾も消す（復帰直後の理不尽な爆死防止）
  // 近くの敵を外へ押し出して仕切り直す
  for (const e of g.enemies) {
    if (e.dead || e.boss) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 300) {
      e.x = p.x + (dx / d) * 340; e.y = p.y + (dy / d) * 340;
      const ed = Math.hypot(e.x, e.y);
      if (ed > ARENA_R - e.r) { const sc = (ARENA_R - e.r) / ed; e.x *= sc; e.y *= sc; }
    }
  }
  setBanner('CONTINUE!', '同じ場所から再開（' + g.deaths + ' 回目の死亡）', '#8affc1');
  Sound.revive();
  state = 'playing';
}

// =========================================================================
//  描画
// =========================================================================
function worldToScreen(x, y) { return { x: x - cam.x, y: y - cam.y }; }

function drawArenaBorder() {
  const c = worldToScreen(0, 0);
  const t = game ? game.time : 0;
  ctx.save();
  // 外側の暗い霧（境界の外を暗く見せる）
  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 6;
  ctx.shadowColor = '#ff2200';
  ctx.shadowBlur = 24;
  // 境界線（点滅しない・常時表示）
  ctx.beginPath(); ctx.arc(c.x, c.y, ARENA_R, 0, TAU); ctx.stroke();
  // 内側のグロー（薄い赤帯）
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 28;
  ctx.beginPath(); ctx.arc(c.x, c.y, ARENA_R - 14, 0, TAU); ctx.stroke();
  ctx.restore();
}

// コアフェーズの侵食演出：アリーナ全体を警告色に塗り、危険地帯にストライプ＋明滅リング、安全地帯を光る円で示す（視認性強化・ユーザー要望）
function drawVoidPhase() {
  const vp = game.voidPhase;
  if (!vp) return;
  const c = worldToScreen(0, 0);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#2a0016';
  ctx.beginPath();
  ctx.arc(c.x, c.y, ARENA_R, 0, TAU);
  ctx.fill();
  // 危険地帯であることを一目で分かるよう、流れる警告ストライプを重ねる
  ctx.save();
  ctx.beginPath(); ctx.arc(c.x, c.y, ARENA_R, 0, TAU); ctx.clip();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = '#ff2d55'; ctx.lineWidth = 16;
  const off = (game.time * 46) % 80;
  for (let i = -ARENA_R * 2; i < ARENA_R * 2; i += 80) {
    ctx.beginPath();
    ctx.moveTo(c.x + i + off - ARENA_R, c.y - ARENA_R);
    ctx.lineTo(c.x + i + off + ARENA_R, c.y + ARENA_R);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
  // 危険エリアの外周にも明滅する警告リング
  const warnPulse = 0.5 + 0.35 * Math.sin(game.time * 8);
  ctx.save();
  ctx.globalAlpha = warnPulse;
  ctx.strokeStyle = '#ff2d55'; ctx.lineWidth = 8; ctx.shadowColor = '#ff2d55'; ctx.shadowBlur = 22;
  ctx.beginPath(); ctx.arc(c.x, c.y, ARENA_R - 8, 0, TAU); ctx.stroke();
  ctx.restore();
  const pulse = 0.7 + 0.3 * Math.sin(game.time * 6);
  for (const z of vp.zones) {
    const s = worldToScreen(z.x, z.y);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = 'rgba(120,255,220,0.3)';
    ctx.strokeStyle = '#7dffdc'; ctx.lineWidth = 4; ctx.shadowColor = '#7dffdc'; ctx.shadowBlur = 26;
    ctx.beginPath(); ctx.arc(s.x, s.y, z.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, z.r - 8, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  // 猶予中は安全地帯外にいても大丈夫なことを画面全体の淡い金色パルスで示す
  // （アリーナは画面よりずっと大きいので、ワールド座標のリングではなく画面端の枠で見せる）
  if (vp.grace > 0) {
    ctx.save();
    ctx.globalAlpha = 0.4 * Math.min(1, vp.grace);
    ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 12; ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 24;
    ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.restore();
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);

  let sx = 0, sy = 0;
  if (cam.shake > 0) { sx = rand(-cam.shake, cam.shake); sy = rand(-cam.shake, cam.shake); }
  ctx.save();
  ctx.translate(sx, sy);

  drawBackground();
  if (game) drawArenaBorder();
  if (game) drawVoidPhase();

  if (game) {
    drawBombs();
    drawShocks();
    drawGems();
    drawMines();
    drawHealthOrbs();
    drawChests();
    drawEnemies();
    drawEnemyBullets();
    drawBolts();
    drawWeapons();
    drawPlayer();
    drawParticles();
    drawTexts();
  }

  ctx.restore();

  if (game && state === 'playing' && game.player.hurtFlash > 0.5) {
    // 被弾直後の赤フラッシュ（hurtFlash 基準。バリアやコンティニューの長い無敵では光らない）
    ctx.fillStyle = 'rgba(255,50,50,' + ((game.player.hurtFlash - 0.5) * 0.7) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  // 画面フラッシュ（ミニボス登場・ウェーブ切替など）
  if (game && game.screenFlash) {
    const sf = game.screenFlash;
    ctx.globalAlpha = clamp(sf.life / sf.max, 0, 1) * 0.45;
    ctx.fillStyle = sf.color;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    sf.life -= 1 / 60;
    if (sf.life <= 0) game.screenFlash = null;
  }

  // 低HP危機ヴィネット・敵レーダー（HUDの下レイヤーに描画）
  if (game && state === 'playing') {
    drawDangerVignette();
    drawEnemyRadar();
  }

  if (game) { drawHUD(); drawBanner(); }

  if (state === 'title') drawTitle();
  else if (state === 'levelup') drawLevelUp();
  else if (state === 'paused') drawPause();
  else if (state === 'status') drawStatus();
  else if (state === 'gameover') drawGameOver();
  else if (state === 'win') drawWin();
  else if (state === 'chestitem') drawChestCard();

  if (Sound.isMuted() && !IS_TOUCH) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'right'; ctx.fillText('🔇 M', W - 10, H - 10); }
}

function curTheme() {
  if (!game) return WAVES[0];
  return WAVES[game.wave];
}

function drawBackground() {
  const theme = curTheme();
  ctx.fillStyle = theme.tint;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(-30, -30, W + 60, H + 60);
  ctx.globalAlpha = 1;
  const grid = 48;
  const ox = -((cam.x % grid) + grid) % grid;
  const oy = -((cam.y % grid) + grid) % grid;
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = ox; x <= W; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = oy; y <= H; y += grid) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  // 背景に浮かぶ星（時間でゆっくりキラキラ）
  const t2 = performance.now() / 1000;
  ctx.save();
  for (const st of BG_STARS) {
    const alpha = 0.12 + 0.20 * Math.abs(Math.sin(t2 * 0.7 + st.p));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = theme.accent;
    ctx.beginPath(); ctx.arc(st.x, st.y, st.s, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function glowCircle(x, y, r, color, blur) {
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = blur || 14;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawHealthOrbs() {
  for (const orb of game.healthOrbs) {
    const s = worldToScreen(orb.x, orb.y);
    // 脈動する緑のハート型代わりにクロス形状で表示
    const t = performance.now() / 600;
    const sc = 1 + 0.15 * Math.sin(t + orb.x);
    ctx.save();
    ctx.shadowColor = '#ff6aa0'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#ff7ab5';
    const orbR = orb.r * 1.5 * sc;
    ctx.beginPath(); ctx.arc(s.x, s.y, orbR, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(orbR * 1.4) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('♥', s.x, s.y + 1);
    ctx.restore();
  }
}

// 宝箱の描画（Cycle26）：金色に脈動＋輝きで「拾いたくなる」見た目に
function drawChests() {
  for (const ch of game.chests) {
    const s = worldToScreen(ch.x, ch.y);
    if (s.x < -40 || s.x > W + 40 || s.y < -40 || s.y > H + 40) continue;
    const sc = 1 + 0.10 * Math.sin(ch.t * 5);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(sc, sc);
    ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 20;
    // 本体（茶色の箱）＋金の帯
    ctx.fillStyle = '#7a5218';
    ctx.fillRect(-12, -9, 24, 18);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-12, -3, 24, 5);
    ctx.strokeStyle = '#ffe98a'; ctx.lineWidth = 2;
    ctx.strokeRect(-12, -9, 24, 18);
    // 鍵穴
    ctx.fillStyle = '#3a2a08';
    ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawTrail() {
  const trail = game.trail;
  if (!trail || trail.length < 2) return;
  for (let i = 0; i < trail.length; i++) {
    const pt = trail[i];
    const s = worldToScreen(pt.x, pt.y);
    const maxLife = pt.dash ? 0.22 : 0.35;
    const alpha = (pt.life / maxLife) * (pt.dash ? 0.75 : 0.5);
    const color = pt.dash ? `rgba(220,250,255,${alpha})` : `rgba(92,240,255,${alpha})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, pt.r, 0, TAU);
    ctx.fillStyle = color; ctx.fill();
  }
}

function drawPlayer() {
  const p = game.player;
  drawTrail();
  const s = worldToScreen(p.x, p.y);
  if (p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0) return;
  // 無敵時間中は黄色で表示して、被弾しない状態だと一目で分かるように（ユーザー要望）
  const invuln = p.invuln > 0;
  const glowColor = invuln ? '#ffe14d' : '#5cf0ff';
  glowCircle(s.x, s.y, p.r, glowColor, 28);
  // 外枠リング（プレイヤーを敵から判別しやすくする）
  ctx.save();
  ctx.strokeStyle = invuln ? 'rgba(255,225,77,0.7)' : 'rgba(92,240,255,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(s.x, s.y, p.r + 4, 0, TAU); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = invuln ? '#fff9d6' : '#eaffff';
  ctx.beginPath(); ctx.arc(s.x, s.y, p.r * 0.5, 0, TAU); ctx.fill();
  ctx.strokeStyle = invuln ? '#ffe14d' : '#bff7ff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + p.facing.x * (p.r + 8), s.y + p.facing.y * (p.r + 8)); ctx.stroke();
  // バリアのリング（Cycle14）：充電量に応じて光る
  if (p.barrierActive) {
    const ratio = p.barrierCharge / 20;
    const full = ratio >= 1;
    const t2 = performance.now() / 700;
    const pulse = full ? (0.7 + 0.3 * Math.sin(t2)) : ratio * 0.55;
    ctx.save();
    ctx.strokeStyle = full ? '#88aaff' : 'rgba(100,140,255,0.4)';
    ctx.shadowColor = '#88aaff'; ctx.shadowBlur = full ? 16 : 4;
    ctx.lineWidth = full ? 2.5 : 1.5;
    ctx.globalAlpha = pulse;
    ctx.beginPath(); ctx.arc(s.x, s.y, p.r + 10, 0, TAU * ratio); ctx.stroke();
    ctx.restore();
  }
}

// grunt を猫に見せる：本体の円に耳・目・鼻を重ねる（col は被弾フラッシュ/凍結色を引き継ぐ）
function drawCatFace(s, e, col) {
  const r = e.r;
  // 三角の耳（左右）。本体と同じ色で光らせる
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(s.x - r * 0.95, s.y - r * 0.55);
  ctx.lineTo(s.x - r * 0.50, s.y - r * 1.45);
  ctx.lineTo(s.x - r * 0.05, s.y - r * 0.60);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(s.x + r * 0.95, s.y - r * 0.55);
  ctx.lineTo(s.x + r * 0.50, s.y - r * 1.45);
  ctx.lineTo(s.x + r * 0.05, s.y - r * 0.60);
  ctx.closePath(); ctx.fill();
  // 目（黒）・鼻（ピンク）。小さく描いて猫っぽさを出す
  ctx.fillStyle = 'rgba(20,10,20,.85)';
  ctx.beginPath(); ctx.arc(s.x - r * 0.38, s.y - r * 0.05, r * 0.16, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(s.x + r * 0.38, s.y - r * 0.05, r * 0.16, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff8ac0';
  ctx.beginPath(); ctx.arc(s.x, s.y + r * 0.28, r * 0.12, 0, TAU); ctx.fill();
  // ひげ（細い線）
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(s.x - r * 0.15, s.y + r * 0.30); ctx.lineTo(s.x - r * 0.95, s.y + r * 0.18);
  ctx.moveTo(s.x - r * 0.15, s.y + r * 0.38); ctx.lineTo(s.x - r * 0.95, s.y + r * 0.46);
  ctx.moveTo(s.x + r * 0.15, s.y + r * 0.30); ctx.lineTo(s.x + r * 0.95, s.y + r * 0.18);
  ctx.moveTo(s.x + r * 0.15, s.y + r * 0.38); ctx.lineTo(s.x + r * 0.95, s.y + r * 0.46);
  ctx.stroke();
}

function drawSwiftFace(s, e, col) {
  const r = e.r;
  // 鋭い一つ目（高速で獲物を追う目つき）
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.beginPath(); ctx.ellipse(s.x, s.y - r * 0.12, r * 0.30, r * 0.20, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(20,10,10,.9)';
  ctx.beginPath(); ctx.arc(s.x, s.y - r * 0.10, r * 0.13, 0, TAU); ctx.fill();
  // 後方へ伸びるスピードライン（疾走感）
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(s.x - r * 0.55, s.y + r * 0.35); ctx.lineTo(s.x - r * 0.95, s.y + r * 0.95);
  ctx.moveTo(s.x, s.y + r * 0.55); ctx.lineTo(s.x, s.y + r * 1.15);
  ctx.moveTo(s.x + r * 0.55, s.y + r * 0.35); ctx.lineTo(s.x + r * 0.95, s.y + r * 0.95);
  ctx.stroke();
}

function drawWeaverFace(s, e, col) {
  const r = e.r;
  // 頭上でゆらめく触角2本（蛇行の予兆）
  const wob = Math.sin(game.time * 5 + e.seed) * 0.25;
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s.x - r * 0.35, s.y - r * 0.75);
  ctx.quadraticCurveTo(s.x - r * (0.65 + wob), s.y - r * 1.35, s.x - r * (0.45 + wob * 1.4), s.y - r * 1.6);
  ctx.moveTo(s.x + r * 0.35, s.y - r * 0.75);
  ctx.quadraticCurveTo(s.x + r * (0.65 - wob), s.y - r * 1.35, s.x + r * (0.45 - wob * 1.4), s.y - r * 1.6);
  ctx.stroke();
  // 細く傾いた蛇のような目
  ctx.fillStyle = 'rgba(20,10,20,.85)';
  ctx.save(); ctx.translate(s.x - r * 0.32, s.y - r * 0.05); ctx.rotate(-0.3);
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.22, r * 0.08, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(s.x + r * 0.32, s.y - r * 0.05); ctx.rotate(0.3);
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.22, r * 0.08, 0, 0, TAU); ctx.fill(); ctx.restore();
}

function drawTankFace(s, e, col) {
  const r = e.r;
  // 装甲鋲（重装甲の質感）
  ctx.fillStyle = 'rgba(20,10,40,.55)';
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + Math.PI / 6; ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * r * 0.68, s.y + Math.sin(a) * r * 0.68, r * 0.12, 0, TAU); ctx.fill(); }
  // 中央の重厚な十字グリル
  ctx.strokeStyle = 'rgba(20,10,40,.65)'; ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.moveTo(s.x - r * 0.42, s.y); ctx.lineTo(s.x + r * 0.42, s.y);
  ctx.moveTo(s.x, s.y - r * 0.42); ctx.lineTo(s.x, s.y + r * 0.42);
  ctx.stroke();
}

function drawSplitterFace(s, e, col) {
  const r = e.r;
  // ひび割れ模様（分裂の予兆）
  ctx.strokeStyle = 'rgba(20,40,30,.6)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - r * 0.7, s.y - r * 0.6);
  ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + r * 0.75, s.y - r * 0.4);
  ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - r * 0.5, s.y + r * 0.7);
  ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + r * 0.6, s.y + r * 0.65);
  ctx.stroke();
  // 中心で脈動する核（分裂を内包している印）
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260 + e.seed);
  ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * pulse})`;
  ctx.beginPath(); ctx.arc(s.x, s.y, r * (0.20 + 0.08 * pulse), 0, TAU); ctx.fill();
}

function drawSpitterFace(s, e, col) {
  const r = e.r;
  const p = game.player;
  const ang = Math.atan2(p.y - e.y, p.x - e.x);
  const near = e.fireTimer !== undefined ? clamp(1 - e.fireTimer / 0.6, 0, 1) : 0;
  // プレイヤーを向く砲口（発射が近いほど赤く輝く）
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(ang);
  ctx.fillStyle = 'rgba(20,10,10,.7)';
  ctx.beginPath(); ctx.arc(r * 0.38, 0, r * 0.30, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(255,${Math.round(180 * (1 - near))},60,${0.5 + 0.5 * near})`;
  ctx.beginPath(); ctx.arc(r * 0.38, 0, r * 0.15, 0, TAU); ctx.fill();
  ctx.restore();
  // 上部の小さな目
  ctx.fillStyle = 'rgba(20,10,10,.85)';
  ctx.beginPath(); ctx.arc(s.x - r * 0.08, s.y - r * 0.4, r * 0.11, 0, TAU); ctx.fill();
}

function drawDasherFace(s, e, col) {
  const r = e.r;
  const charging = e.ds === 'charge';
  const dashing = e.ds === 'dash';
  // 獲物を狙う鋭い目（ため中は白く輝く）
  ctx.fillStyle = charging ? '#fff8d0' : 'rgba(20,20,10,.85)';
  ctx.save(); ctx.translate(s.x - r * 0.28, s.y - r * 0.05); ctx.rotate(-0.15);
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.20, r * 0.10, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(s.x + r * 0.28, s.y - r * 0.05); ctx.rotate(0.15);
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.20, r * 0.10, 0, 0, TAU); ctx.fill(); ctx.restore();
  if (charging) {
    // ため中：中心にエネルギーが凝縮
    const t = performance.now() / 100;
    ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.abs(Math.sin(t))})`;
    ctx.beginPath(); ctx.arc(s.x, s.y + r * 0.25, r * 0.18, 0, TAU); ctx.fill();
  } else if (dashing) {
    // 突進中：進行方向と逆に残像の筋
    const ang = Math.atan2(e.dvy || 0, e.dvx || 1);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      ctx.moveTo(s.x - Math.cos(ang) * r * 0.3, s.y - Math.sin(ang) * r * 0.3);
      ctx.lineTo(s.x - Math.cos(ang) * r * (0.3 + i * 0.5), s.y - Math.sin(ang) * r * (0.3 + i * 0.5));
    }
    ctx.stroke();
  }
}

function drawBomberFace(s, e, col) {
  const r = e.r;
  // 頭上の導火線と火花（点火中は明るく点滅）
  ctx.strokeStyle = 'rgba(80,50,30,.9)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s.x, s.y - r * 0.8);
  ctx.quadraticCurveTo(s.x + r * 0.25, s.y - r * 1.15, s.x + r * 0.1, s.y - r * 1.35);
  ctx.stroke();
  const lit = e.fuse >= 0;
  const sparkPhase = Math.sin(performance.now() / 70 + e.seed);
  ctx.fillStyle = lit ? `rgba(255,${180 + Math.round(60 * sparkPhase)},60,1)` : 'rgba(255,200,80,.8)';
  ctx.beginPath(); ctx.arc(s.x + r * 0.1, s.y - r * 1.35, r * (lit ? 0.18 : 0.11), 0, TAU); ctx.fill();
  // 焦った目とへの字口
  ctx.fillStyle = 'rgba(20,10,10,.85)';
  ctx.beginPath(); ctx.arc(s.x - r * 0.3, s.y - r * 0.05, r * 0.13, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(s.x + r * 0.3, s.y - r * 0.05, r * 0.13, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(20,10,10,.8)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(s.x - r * 0.25, s.y + r * 0.35); ctx.quadraticCurveTo(s.x, s.y + r * 0.18, s.x + r * 0.25, s.y + r * 0.35); ctx.stroke();
}

function drawOrbiterFace(s, e, col) {
  const r = e.r;
  // 周囲を回る光点（旋回する動きを予感させる）
  const baseA = game.time * 3 + e.seed;
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  for (let i = 0; i < 3; i++) {
    const a = baseA + i * TAU / 3;
    ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * r * 1.15, s.y + Math.sin(a) * r * 1.15, r * 0.09, 0, TAU); ctx.fill();
  }
  // プレイヤーを見据える目（発射が近いほど赤く点灯）
  const p = game.player;
  const ang = Math.atan2(p.y - e.y, p.x - e.x);
  const near = e.fireTimer !== undefined ? clamp(1 - e.fireTimer / 0.6, 0, 1) : 0;
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(ang);
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.beginPath(); ctx.ellipse(r * 0.15, 0, r * 0.26, r * 0.18, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(255,${Math.round(80 * (1 - near))},${Math.round(80 * (1 - near))},1)`;
  ctx.beginPath(); ctx.arc(r * 0.25, 0, r * 0.12, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawBruteFace(s, e, col) {
  const r = e.r;
  // 太い眉（怒った表情）
  ctx.save();
  ctx.strokeStyle = 'rgba(20,5,5,.8)'; ctx.lineWidth = r * 0.14; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s.x - r * 0.55, s.y - r * 0.30); ctx.lineTo(s.x - r * 0.15, s.y - r * 0.42);
  ctx.moveTo(s.x + r * 0.55, s.y - r * 0.30); ctx.lineTo(s.x + r * 0.15, s.y - r * 0.42);
  ctx.stroke();
  ctx.restore();
  // 小さく鋭い目
  ctx.fillStyle = 'rgba(20,5,5,.9)';
  ctx.beginPath(); ctx.arc(s.x - r * 0.28, s.y - r * 0.08, r * 0.11, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(s.x + r * 0.28, s.y - r * 0.08, r * 0.11, 0, TAU); ctx.fill();
  // 猪のような下向きの牙（重量級の迫力）
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath();
  ctx.moveTo(s.x - r * 0.35, s.y + r * 0.25); ctx.lineTo(s.x - r * 0.45, s.y + r * 0.55); ctx.lineTo(s.x - r * 0.2, s.y + r * 0.3); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(s.x + r * 0.35, s.y + r * 0.25); ctx.lineTo(s.x + r * 0.45, s.y + r * 0.55); ctx.lineTo(s.x + r * 0.2, s.y + r * 0.3); ctx.closePath(); ctx.fill();
}

function drawEnemyShape(s, e) {
  const r = e.r;
  if (e.shape === 'tri') {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fill();
    // 白縁で三角形を見やすく
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5; ctx.stroke();
  } else if (e.shape === 'square') {
    ctx.fillRect(s.x - r * 0.8, s.y - r * 0.8, r * 1.6, r * 1.6);
  } else if (e.shape === 'hex') {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();
  }
}

function drawEnemies() {
  const voidFrozen = !!game.voidPhase; // コアフェーズ中はボス以外の雑魚が侵食に呑まれて沈黙する
  for (const e of game.enemies) {
    const s = worldToScreen(e.x, e.y);
    if (s.x < -70 || s.x > W + 70 || s.y < -70 || s.y > H + 70) continue;
    if (e.boss || e.kind === 'miniboss') { drawBoss(e, s); continue; }
    let col = e.hitFlash > 0 ? '#ffffff' : e.color;
    if (voidFrozen && e.hitFlash <= 0) col = '#8f6fd9'; // 侵食色に染まって沈黙している
    if (e.freezeT > 0) {
      col = '#bfe8ff';
      // 凍結エフェクト: 六角形の氷晶アウトライン
      ctx.save();
      ctx.strokeStyle = '#88ddff'; ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(performance.now() / 200);
      ctx.beginPath();
      for (let hi = 0; hi < 6; hi++) { const ha = hi * TAU / 6; const hx = s.x + Math.cos(ha) * (e.r * 1.45), hy = s.y + Math.sin(ha) * (e.r * 1.45); hi ? ctx.lineTo(hx, hy) : ctx.moveTo(hx, hy); }
      ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
    if (e.fuse >= 0 && Math.floor(e.fuse * 14) % 2 === 0) col = '#ffffff'; // 自爆導火で点滅
    if (e.elite) {
      const t3 = performance.now() / 600;
      ctx.globalAlpha = 0.5 + 0.3 * Math.abs(Math.sin(t3));
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3;
      ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(s.x, s.y, e.r * 1.55, 0, TAU); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    if (e.kind === 'brute' && (e.slamWarn || 0) > 0) {
      // 叩きつけ予告：ボスのストンプ警告と同じ見た目の赤い点滅円
      const pulse = 0.35 + 0.45 * Math.abs(Math.sin(game.time * 14));
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#ff1100'; ctx.lineWidth = 4; ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(s.x, s.y, e.r + 66, 0, TAU); ctx.stroke();
      ctx.globalAlpha = pulse * 0.22; ctx.fillStyle = '#ff1100';
      ctx.beginPath(); ctx.arc(s.x, s.y, e.r + 66, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = voidFrozen ? 0.5 : 1; ctx.fillStyle = col;
    drawEnemyShape(s, e);
    if (e.kind === 'grunt') {
      drawCatFace(s, e, col); // ピンクのザコは猫の見た目に
    } else if (e.kind === 'swift') {
      drawSwiftFace(s, e, col);
    } else if (e.kind === 'weaver') {
      drawWeaverFace(s, e, col);
    } else if (e.kind === 'tank') {
      drawTankFace(s, e, col);
    } else if (e.kind === 'splitter') {
      drawSplitterFace(s, e, col);
    } else if (e.kind === 'spitter') {
      drawSpitterFace(s, e, col);
    } else if (e.kind === 'dasher') {
      drawDasherFace(s, e, col);
    } else if (e.kind === 'bomber') {
      drawBomberFace(s, e, col);
    } else if (e.kind === 'orbiter') {
      drawOrbiterFace(s, e, col);
    } else if (e.kind === 'brute') {
      drawBruteFace(s, e, col);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.30)';
      ctx.beginPath(); ctx.arc(s.x - e.r * 0.3, s.y - e.r * 0.3, e.r * 0.32, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (voidFrozen) {
      // 侵食の繭：紫の靄がゆっくり明滅し、無害化されていることを示す
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.15 * Math.sin(game.time * 2 + e.x * 0.01 + e.y * 0.01);
      ctx.strokeStyle = '#b98cff'; ctx.lineWidth = 1.5; ctx.shadowColor = '#7a3fc9'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(s.x, s.y, e.r * 1.35, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (e.hp < e.maxHp) {
      const w = e.r * 2, hpw = w * clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(s.x - w / 2, s.y - e.r - 8, w, 3);
      ctx.fillStyle = '#7CFF8A'; ctx.fillRect(s.x - w / 2, s.y - e.r - 8, hpw, 3);
    }
  }
}

function drawBoss(e, s) {
  const t = game.time;
  const bt = e.bossType || 'overlord';
  const flash = e.hitFlash > 0;

  // ボス専用フロアシャドウ（地面に投影される存在感）
  ctx.globalAlpha = 0.28; ctx.fillStyle = e.color;
  ctx.beginPath(); ctx.arc(s.x, s.y, e.r * 1.8, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;

  // ストンプ警告円（赤く点滅する予告エリア）
  if ((e.stompWarn || 0) > 0) {
    const sw = worldToScreen(e.stompX, e.stompY);
    const pulse = 0.35 + 0.45 * Math.abs(Math.sin(t * 14));
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#ff1100'; ctx.lineWidth = 4; ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(sw.x, sw.y, 90, 0, TAU); ctx.stroke();
    ctx.globalAlpha = pulse * 0.25;
    ctx.fillStyle = '#ff1100';
    ctx.beginPath(); ctx.arc(sw.x, sw.y, 90, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ワープ予告マーカー（黄色の点滅円＋クロスヘア。blinker とラスボスの瞬移で共用）
  if ((bt === 'blinker' || bt === 'overlord') && e.warpTarget && e.warpTimer > 0) {
    const wt = worldToScreen(e.warpTarget.x, e.warpTarget.y);
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(t * 16));
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 3; ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(wt.x, wt.y, e.r + 16, 0, TAU); ctx.stroke();
    // クロスヘア
    const cs = 22;
    ctx.beginPath(); ctx.moveTo(wt.x - cs, wt.y); ctx.lineTo(wt.x + cs, wt.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wt.x, wt.y - cs); ctx.lineTo(wt.x, wt.y + cs); ctx.stroke();
    ctx.globalAlpha = pulse * 0.15;
    ctx.fillStyle = '#ffff00';
    ctx.beginPath(); ctx.arc(wt.x, wt.y, e.r + 16, 0, TAU); ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(s.x, s.y);
  // ラスボス登場演出：拡大しながら現れる（もっとラスボス感・ユーザー要望）
  if (bt === 'overlord' && e.spawnFx > 0) {
    const sp = 1 - clamp(e.spawnFx / 1.2, 0, 1);
    ctx.globalAlpha = sp;
    ctx.scale(0.4 + sp * 0.6, 0.4 + sp * 0.6);
  }

  if (bt === 'spreader') {
    // 弾幕型：高速回転する8角星、シアン
    ctx.shadowColor = e.color; ctx.shadowBlur = 32;
    ctx.rotate(t * 1.8);
    ctx.fillStyle = flash ? '#fff' : e.color;
    const sp = 8;
    ctx.beginPath();
    for (let i = 0; i < sp * 2; i++) {
      const rr = i % 2 === 0 ? e.r + 16 : e.r - 2;
      const a = (Math.PI / sp) * i;
      i ? ctx.lineTo(Math.cos(a)*rr, Math.sin(a)*rr) : ctx.moveTo(Math.cos(a)*rr, Math.sin(a)*rr);
    }
    ctx.closePath(); ctx.fill();
    // 逆回転リング
    ctx.rotate(-t * 3.2);
    ctx.strokeStyle = flash ? '#fff' : 'rgba(0,220,255,0.55)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, e.r + 22, 0, TAU); ctx.stroke();
    ctx.fillStyle = flash ? '#fff' : '#b0f8ff';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.45, 0, TAU); ctx.fill();

  } else if (bt === 'charger') {
    // 突進型：プレイヤーへ向けた矢印形、赤
    ctx.shadowColor = e.color; ctx.shadowBlur = 30;
    const ang = Math.atan2(game.player.y - e.y, game.player.x - e.x);
    ctx.rotate(ang);
    ctx.fillStyle = flash ? '#fff' : e.color;
    ctx.beginPath();
    ctx.moveTo(e.r + 18, 0);
    ctx.lineTo(-e.r + 6, -(e.r * 0.88));
    ctx.lineTo(-e.r * 0.4, 0);
    ctx.lineTo(-e.r + 6, e.r * 0.88);
    ctx.closePath(); ctx.fill();
    // トレイル（スピード感）
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = flash ? '#fff' : e.color;
    ctx.beginPath();
    ctx.moveTo(-e.r + 6, -(e.r * 0.6));
    ctx.lineTo(-e.r - 22, 0);
    ctx.lineTo(-e.r + 6, e.r * 0.6);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.rotate(-ang); // 矢印の向きだけ戻す（丸いコアは描かない・ユーザー要望「丸で覆わないで」）

  } else if (bt === 'bomber') {
    // 爆撃型：六芒星＋回転ルーン、オレンジ
    ctx.shadowColor = e.color; ctx.shadowBlur = 34;
    ctx.rotate(t * 0.55);
    ctx.fillStyle = flash ? '#fff' : e.color;
    for (let tri = 0; tri < 2; tri++) {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + tri * Math.PI / 3 + i * TAU / 3;
        const rr = e.r + 14;
        i ? ctx.lineTo(Math.cos(a)*rr, Math.sin(a)*rr) : ctx.moveTo(Math.cos(a)*rr, Math.sin(a)*rr);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.rotate(-t * 1.2);
    ctx.strokeStyle = flash ? '#fff' : 'rgba(255,175,90,0.5)'; ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    ctx.beginPath(); ctx.arc(0, 0, e.r * 1.55, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = flash ? '#fff' : '#ffd9a8';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.42, 0, TAU); ctx.fill();

  } else if (bt === 'blinker') {
    // 瞬移型：6角星、金色、高速点滅
    const flicker = Math.sin(t * 22) > 0.2;
    ctx.shadowColor = e.color; ctx.shadowBlur = flicker ? 42 : 10;
    ctx.globalAlpha = flicker ? 1.0 : 0.55;
    ctx.rotate(t * 2.8);
    ctx.fillStyle = flash ? '#fff' : (flicker ? e.color : '#cc9900');
    const sp = 6;
    ctx.beginPath();
    for (let i = 0; i < sp * 2; i++) {
      const rr = i % 2 === 0 ? e.r + 20 : e.r * 0.28;
      const a = (Math.PI / sp) * i;
      i ? ctx.lineTo(Math.cos(a)*rr, Math.sin(a)*rr) : ctx.moveTo(Math.cos(a)*rr, Math.sin(a)*rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = flash ? '#fff' : '#ffe580';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.46, 0, TAU); ctx.fill();

  } else if (bt === 'sniper') {
    // 狙撃型：常時回転する破線の照準リング＋プレイヤーへ向く鋭い菱形、黄緑
    ctx.shadowColor = e.color; ctx.shadowBlur = 30;
    const ang = Math.atan2(game.player.y - e.y, game.player.x - e.x);
    ctx.rotate(t * 1.2);
    ctx.strokeStyle = flash ? '#fff' : e.color; ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.arc(0, 0, e.r + 18, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.rotate(-t * 1.2);
    ctx.rotate(ang);
    ctx.fillStyle = flash ? '#fff' : e.color;
    ctx.beginPath();
    ctx.moveTo(e.r + 22, 0);
    ctx.lineTo(0, -e.r * 0.5);
    ctx.lineTo(-e.r * 0.7, 0);
    ctx.lineTo(0, e.r * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.rotate(-ang);
    ctx.fillStyle = flash ? '#fff' : '#d4ffb0';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.34, 0, TAU); ctx.fill();
    ctx.strokeStyle = flash ? '#fff' : '#0a3300'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-e.r * 0.5, 0); ctx.lineTo(e.r * 0.5, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -e.r * 0.5); ctx.lineTo(0, e.r * 0.5); ctx.stroke();

  } else {
    // overlord（ラスボス）：二重構造の豪華な星形
    const rage = e.hp < e.maxHp * 0.4;
    ctx.shadowColor = e.color; ctx.shadowBlur = rage ? 48 : 30;
    // 外側：ゆっくり回転する大きな星
    ctx.rotate(t * 0.5);
    ctx.fillStyle = flash ? '#fff' : e.color;
    const outerSp = 16;
    ctx.beginPath();
    for (let i = 0; i < outerSp * 2; i++) {
      const rr = i % 2 === 0 ? e.r + 20 : e.r + 6;
      const a = (Math.PI / outerSp) * i;
      i ? ctx.lineTo(Math.cos(a)*rr, Math.sin(a)*rr) : ctx.moveTo(Math.cos(a)*rr, Math.sin(a)*rr);
    }
    ctx.closePath(); ctx.fill();
    // 内側：逆方向に速く回転（激昂時はさらに速く）
    ctx.rotate(-t * (rage ? 2.4 : 1.5));
    ctx.fillStyle = flash ? '#fff' : (rage ? '#ff9be0' : '#c040b0');
    const innerSp = 8;
    ctx.beginPath();
    for (let i = 0; i < innerSp * 2; i++) {
      const rr = i % 2 === 0 ? e.r * 0.7 + 8 : e.r * 0.3;
      const a = (Math.PI / innerSp) * i;
      i ? ctx.lineTo(Math.cos(a)*rr, Math.sin(a)*rr) : ctx.moveTo(Math.cos(a)*rr, Math.sin(a)*rr);
    }
    ctx.closePath(); ctx.fill();
    // コア
    ctx.fillStyle = flash ? '#fff' : (rage ? '#ffd0f0' : '#ffffff');
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.22, 0, TAU); ctx.fill();
    // 常時オーラ：漂う二重光輪＋放射光条（もっとラスボス感・ユーザー要望）
    ctx.save();
    ctx.rotate(t * 0.8);
    const auraPulse = 0.35 + 0.25 * Math.sin(t * 2.2);
    ctx.globalAlpha = auraPulse;
    ctx.strokeStyle = rage ? '#ff9be0' : '#ff4be0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, e.r + 44, 0, TAU); ctx.stroke();
    ctx.globalAlpha = auraPulse * 0.6;
    ctx.beginPath(); ctx.arc(0, 0, e.r + 58, 0, TAU); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.rotate(-t * 0.4);
    ctx.strokeStyle = `rgba(255,140,220,${0.25 + 0.15 * Math.sin(t * 3)})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (TAU / 8) * i;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (e.r + 10), Math.sin(a) * (e.r + 10));
      ctx.lineTo(Math.cos(a) * (e.r + 70), Math.sin(a) * (e.r + 70));
      ctx.stroke();
    }
    ctx.restore();
    // 激昂時：外周に追加のオーラリング
    if (rage) {
      ctx.rotate(t * 3.0);
      ctx.strokeStyle = 'rgba(255,80,200,0.6)'; ctx.lineWidth = 4;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(0, 0, e.r + 32, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();

  // 種類ラベル（ミニボスのみ）
  if (e.kind === 'miniboss' && e.bossType) {
    const labels = { spreader: '弾幕型', charger: '突進型', bomber: '爆撃型', blinker: '瞬移型', sniper: '狙撃型' };
    ctx.fillStyle = e.color; ctx.shadowColor = e.color; ctx.shadowBlur = 8;
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(labels[e.bossType] || '', s.x, s.y - e.r - 24);
    ctx.shadowBlur = 0;
  }
  // HPバー（ラスボスは専用の装飾バー：太字・パルス枠・コアフェーズ閾値マーカー付き）
  if (bt === 'overlord') {
    const w = Math.min(420, e.r * 4.2), hpw = w * clamp(e.hp / e.maxHp, 0, 1);
    const bx2 = s.x - w / 2, by2 = s.y - e.r - 34;
    const bpulse = 0.6 + 0.4 * Math.sin(t * 4);
    ctx.save();
    ctx.fillStyle = 'rgba(10,0,10,.75)'; ctx.fillRect(bx2 - 3, by2 - 3, w + 6, 12);
    ctx.strokeStyle = `rgba(255,75,224,${bpulse})`; ctx.lineWidth = 2; ctx.shadowColor = '#ff4be0'; ctx.shadowBlur = 10;
    ctx.strokeRect(bx2 - 3, by2 - 3, w + 6, 12);
    const grad = ctx.createLinearGradient(bx2, 0, bx2 + w, 0);
    grad.addColorStop(0, '#ff4be0'); grad.addColorStop(1, '#ffd0f0');
    ctx.fillStyle = grad;
    ctx.fillRect(bx2, by2, hpw, 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
    for (const th of e.coreThresholds || []) {
      const mx = bx2 + w * th;
      ctx.beginPath(); ctx.moveTo(mx, by2 - 2); ctx.lineTo(mx, by2 + 8); ctx.stroke();
    }
    ctx.fillStyle = '#ff9be0'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('FINAL BOSS', s.x, by2 - 8);
    ctx.restore();
  } else {
    const w = e.r * 2.8, hpw = w * clamp(e.hp / e.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(s.x - w / 2, s.y - e.r - 18, w, 6);
    ctx.fillStyle = e.boss ? '#ff4be0' : e.color; ctx.fillRect(s.x - w / 2, s.y - e.r - 18, hpw, 6);
  }
}

function drawBombs() {
  // 爆撃の予告円：オレンジの点滅リング＋内側の導火線ゲージ（塗りが広がりきったら爆発）
  for (const b of game.bombs) {
    const s = worldToScreen(b.x, b.y);
    const prog = 1 - b.t / b.max;
    const pulse = 0.35 + 0.45 * Math.abs(Math.sin(game.time * 13 + b.max * 7));
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#ff9b3d'; ctx.lineWidth = 3; ctx.shadowColor = '#ff7b00'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(s.x, s.y, b.r, 0, TAU); ctx.stroke();
    ctx.globalAlpha = pulse * 0.4;
    ctx.fillStyle = '#ff5500';
    ctx.beginPath(); ctx.arc(s.x, s.y, b.r * prog, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawShocks() {
  for (const s of game.shocks) {
    const sc = worldToScreen(s.x, s.y);
    const a = clamp(s.life / (s.maxR / s.vr), 0, 1);
    ctx.save();
    ctx.globalAlpha = a * 0.8;
    ctx.strokeStyle = s.color; ctx.lineWidth = 6; ctx.shadowColor = s.color; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(sc.x, sc.y, s.r, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawMines() {
  for (const m of game.mines) {
    const s = worldToScreen(m.x, m.y);
    const armed = m.arm <= 0;
    const blink = Math.floor(game.time * 6) % 2 === 0;
    const mr = m.r * 0.85;
    glowCircle(s.x, s.y, mr, armed ? (blink ? '#ffd23f' : '#ff7b3d') : '#aaa', armed ? 16 : 6);
    // ☢マーク（設置物と分かるように）
    ctx.save();
    ctx.fillStyle = armed ? (blink ? '#1a0e00' : '#2a1200') : '#333';
    ctx.font = 'bold ' + Math.round(mr * 1.4) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('☢', s.x, s.y + 1);
    ctx.restore();
  }
}

function drawBolts() {
  for (const z of game.bolts) {
    const a = worldToScreen(z.x1, z.y1), b = worldToScreen(z.x2, z.y2);
    ctx.save();
    ctx.globalAlpha = clamp(z.life / z.max, 0, 1);
    ctx.strokeStyle = z.color; ctx.lineWidth = 3; ctx.shadowColor = z.color; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(a.x, a.y);
    const segs = 4;
    for (let i = 1; i < segs; i++) {
      const tt = i / segs;
      const mx = lerp(a.x, b.x, tt) + rand(-8, 8);
      const my = lerp(a.y, b.y, tt) + rand(-8, 8);
      ctx.lineTo(mx, my);
    }
    ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawEnemyBullets() {
  for (const b of game.enemyBullets) {
    const s = worldToScreen(b.x, b.y);
    if (b.kind === 'spitter') drawSpitterBullet(s, b);
    else if (b.kind === 'orbiter') drawOrbiterBullet(s, b);
    else drawGenericBullet(s, b);
  }
}

function drawGenericBullet(s, b) {
  const pulse = b.r * (1 + Math.sin(game.time * 12) * 0.15);
  ctx.save();
  // 黒縁（輪郭）で敵弾と背景・XPジェムを見分けやすくする
  ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.strokeStyle = '#000000'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(s.x, s.y, pulse + 2, 0, TAU); ctx.stroke();
  ctx.shadowColor = b.color || '#ff2d5e'; ctx.shadowBlur = 16;
  ctx.fillStyle = b.color || '#ff2d5e';
  ctx.beginPath(); ctx.arc(s.x, s.y, pulse + 2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(s.x, s.y, b.r * 0.4, 0, TAU); ctx.fill();
  ctx.restore();
}

// spitter弾：進行方向に伸びる涙滴（炎の弾丸）。速く飛んでくるのが一目で分かるよう尾を引かせる
function drawSpitterBullet(s, b) {
  const ang = Math.atan2(b.vy, b.vx);
  ctx.save();
  ctx.translate(s.x, s.y); ctx.rotate(ang);
  // 尾（黒縁つき、後方に伸びる半透明の炎）
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.fillStyle = '#000000'; ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.moveTo(b.r * 1.4, 0); ctx.lineTo(-b.r * 3.6, b.r * 1.1); ctx.lineTo(-b.r * 3.6, -b.r * 1.1); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.85; ctx.fillStyle = '#ff9b3d'; ctx.shadowColor = '#ff9b3d'; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.moveTo(b.r * 1.2, 0); ctx.lineTo(-b.r * 3.0, b.r * 0.85); ctx.lineTo(-b.r * 3.0, -b.r * 0.85); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  // 頭（白熱コア）
  ctx.fillStyle = '#ff2d5e'; ctx.shadowColor = '#ff2d5e'; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff6e0';
  ctx.beginPath(); ctx.arc(b.r * 0.3, 0, b.r * 0.42, 0, TAU); ctx.fill();
  ctx.restore();
}

// orbiter弾：自転する紫のダイヤ型エネルギー弾＋薄いリング（弾幕の中でも視認しやすいよう回転で目を引く）
function drawOrbiterBullet(s, b) {
  const spin = (b.spin || 0) + game.time * 10;
  ctx.save();
  ctx.translate(s.x, s.y);
  // 外周リング
  ctx.globalAlpha = 0.45; ctx.strokeStyle = '#c99bff'; ctx.lineWidth = 2; ctx.shadowColor = '#a04bff'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(0, 0, b.r * 1.8, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.rotate(spin);
  // 黒縁ダイヤ
  ctx.fillStyle = '#000000'; ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.beginPath(); ctx.moveTo(0, -b.r - 2); ctx.lineTo(b.r + 2, 0); ctx.lineTo(0, b.r + 2); ctx.lineTo(-b.r - 2, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a04bff'; ctx.shadowColor = '#a04bff'; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.moveTo(0, -b.r); ctx.lineTo(b.r, 0); ctx.lineTo(0, b.r); ctx.lineTo(-b.r, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f0e0ff';
  ctx.beginPath(); ctx.arc(0, 0, b.r * 0.35, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawWeapons() {
  const p = game.player, w = game.player.weapons;
  // フロストの冷気フィールド
  if (w.frost.lv > 0) {
    const s = worldToScreen(p.x, p.y);
    ctx.save();
    ctx.fillStyle = 'rgba(90,200,255,.08)';
    ctx.strokeStyle = 'rgba(120,220,255,.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, w.frost.radius, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // オービット
  if (w.orbit.lv > 0) {
    for (let i = 0; i < w.orbit.count; i++) {
      const a = w.orbit.angle + (TAU / w.orbit.count) * i;
      const s = worldToScreen(p.x + Math.cos(a) * w.orbit.radius, p.y + Math.sin(a) * w.orbit.radius);
      glowCircle(s.x, s.y, w.orbit.evolved ? 12 : 8, w.orbit.evolved ? '#8af0ff' : '#4fd2ff', 16);
    }
  }
  // 弾（進行方向に伸ばして「飛び道具」と分かるように）
  for (const b of game.bullets) {
    const s = worldToScreen(b.x, b.y);
    const ang = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(ang);
    ctx.shadowColor = b.color || '#ffe34d'; ctx.shadowBlur = 12;
    ctx.fillStyle = b.color || '#ffe34d';
    ctx.beginPath(); ctx.ellipse(0, 0, b.r * 2.0, b.r * 0.75, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawGems() {
  for (const gem of game.gems) {
    const s = worldToScreen(gem.x, gem.y);
    const r = gem.big ? 11 : 8;
    const col = gem.big ? '#b6ffce' : '#6bff9e';
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 14;
    ctx.fillStyle = col;
    // ダイヤモンド（45度回転した正方形）で経験値ジェムと分かる形に
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - r);
    ctx.lineTo(s.x + r, s.y);
    ctx.lineTo(s.x, s.y + r);
    ctx.lineTo(s.x - r, s.y);
    ctx.closePath(); ctx.fill();
    // 外枠（輪郭）
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    ctx.stroke();
    // 中心に白いハイライト
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(s.x - r * 0.2, s.y - r * 0.25, r * 0.28, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawParticles() {
  for (const pt of game.particles) {
    const s = worldToScreen(pt.x, pt.y);
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, pt.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawTexts() {
  ctx.textAlign = 'center';
  for (const tx of game.texts) {
    const s = worldToScreen(tx.x, tx.y);
    ctx.globalAlpha = clamp(tx.life / tx.max, 0, 1);
    ctx.fillStyle = tx.color;
    ctx.font = 'bold ' + (tx.big ? 22 : 14) + 'px sans-serif';
    ctx.fillText(tx.txt, s.x, s.y);
  }
  ctx.globalAlpha = 1;
}

// ---- HUD（上部の情報表示） ----
// スマホ（タッチ端末）では左上ステータス一式をひと回り大きく表示する（原点(14,14)基準で拡大）
const HUD_SCALE = IS_TOUCH ? 1.35 : 1;
function drawHUD() {
  const p = game.player;
  ctx.save();
  ctx.translate(14, 14);
  ctx.scale(HUD_SCALE, HUD_SCALE);
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, 240, 22);
  const hpPct = clamp(p.hp / p.maxHp, 0, 1);
  const hpCol = hpPct > 0.50 ? '#ff5c7a' : (hpPct > 0.25 ? '#ff8c00' : '#ff2222');
  ctx.fillStyle = hpCol;
  if (hpPct <= 0.25) { ctx.shadowColor = '#ff2222'; ctx.shadowBlur = (Math.sin(Date.now() / 150) * 0.5 + 0.5) * 12; }
  ctx.fillRect(0, 0, 240 * hpPct, 22);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, 240, 22);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('HP ' + Math.ceil(p.hp) + ' / ' + p.maxHp, 6, 16);

  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 26, 240, 13);
  ctx.fillStyle = '#8affc1'; ctx.fillRect(0, 26, 240 * clamp(p.xp / p.xpNext, 0, 1), 13);
  ctx.fillStyle = '#cfe8ff'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('Lv ' + p.level, 246, 20);

  // 取得済み武器アイコン（進化は★）
  let ix = 0;
  for (const key in p.weapons) {
    const wp = p.weapons[key];
    if (wp.lv > 0) {
      ctx.font = '19px sans-serif'; ctx.globalAlpha = 1; ctx.fillStyle = '#cfe8ff';
      ctx.fillText(WEAPON_META[key].icon, ix, 56);
      if (wp.evolved) { ctx.fillStyle = '#ffd23f'; ctx.font = '10px sans-serif'; ctx.fillText('★', ix + 15, 46); }
      ix += 30;
    }
  }

  // スキルCDインジケーター（XPバー下の細いバー。宝箱でスキル入手後のみ表示）
  if (p.activeSkill) {
    const dashMax = 6 * p.skillCdMul;
    const dashReady = p.dashCd <= 0;
    const dashRatio = dashReady ? 1 : clamp(1 - p.dashCd / dashMax, 0, 1);
    const skIcon = '⚡';
    const skName = 'DASH Lv' + p.skillLv;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 43, 100, 4);
    ctx.fillStyle = dashReady ? '#4be0ff' : '#2a7090';
    if (dashReady) { ctx.shadowColor = '#4be0ff'; ctx.shadowBlur = 6; }
    ctx.fillRect(0, 43, 100 * dashRatio, 4);
    ctx.shadowBlur = 0; ctx.font = '10px sans-serif'; ctx.fillStyle = dashReady ? '#4be0ff' : '#5588aa';
    ctx.fillText(dashReady ? skIcon + skName : skIcon + Math.ceil(p.dashCd) + 's', 108, 48);
  }

  // ニトロブースト残り時間（宝箱アイテム）
  if (p.speedBuffT > 0) {
    ctx.fillStyle = '#8affc1'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('💨 NITRO×2  ' + p.speedBuffT.toFixed(1) + 's', 120, 78);
  }

  // ラッシュブーストインジケーター（ラッシュ発動中）
  if (p.rushTimer > 0) {
    ctx.fillStyle = '#4be0ff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('💨 RUSH  ' + p.rushTimer.toFixed(1) + 's', 0, 78);
  }
  // バーサーク状態インジケーター
  if (p.berserkLv > 0 && p.hp / p.maxHp < 0.4) {
    ctx.fillStyle = '#ff5c00'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('🔥 BERSERK', 0, p.rushTimer > 0 ? 94 : 78);
  }
  // アドレナリン状態インジケーター（HP 50%以下で速度ボーナス中）
  if (p.adrenalineLv > 0 && p.hp / p.maxHp < 0.5) {
    const bonus = Math.round(p.adrenalineLv * 15 * (1 - clamp(p.hp / p.maxHp, 0, 1)));
    ctx.fillStyle = '#ff6bbb'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
    let yy = 78;
    if (p.rushTimer > 0) yy += 16;
    if (p.berserkLv > 0 && p.hp / p.maxHp < 0.4) yy += 16;
    ctx.fillText('💉 SPD+' + bonus + '%', 0, yy);
  }
  // XPブーストインジケーター（強欲の輝き発動中）
  if (game.xpBoostTimer > 0) {
    const pct = Math.min(1, game.xpBoostTimer / 30);
    const bx3 = 0, by3 = 42, bw3 = 120, bh3 = 7;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(bx3, by3, bw3, bh3);
    ctx.fillStyle = '#ffea00'; ctx.shadowColor = '#ffea00'; ctx.shadowBlur = 8;
    ctx.fillRect(bx3, by3, bw3 * pct, bh3);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffea00'; ctx.font = 'bold 11px sans-serif';
    ctx.fillText('💎 XP×1.6  ' + Math.ceil(game.xpBoostTimer) + 's', bx3, by3 + 20);
  }
  ctx.restore();

  ctx.textAlign = 'right'; ctx.font = 'bold 22px monospace'; ctx.fillStyle = '#eaffff';
  const tt = Math.floor(game.time);
  const mm = String(Math.floor(tt / 60)).padStart(2, '0');
  const ss = String(tt % 60).padStart(2, '0');
  ctx.fillText(mm + ':' + ss, W - 16, 32);
  ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#9fb6d8';
  ctx.fillText('KILLS ' + game.kills + (game.deaths > 0 ? '  💀' + game.deaths : ''), W - 16, 52);

  const theme = curTheme();
  ctx.fillStyle = theme.accent; ctx.font = 'bold 13px sans-serif';
  const label = 'WAVE ' + (game.wave + 1) + '  ' + theme.name;
  ctx.fillText(label, W - 16, 70);
  // ミニボス出現30秒前から警告カウントダウン（HUD右上）
  if (!game.finalBossSpawned) {
    const toNext = game.miniBossAt - game.time;
    const bossAlive = game.enemies.some(e => !e.dead && (e.kind === 'miniboss' || e.boss));
    if (!bossAlive && toNext > 0 && toNext < 30) {
      ctx.fillStyle = toNext < 10 ? '#ff5c7a' : '#ffb24b';
      ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('⚠ ボス まで ' + Math.ceil(toNext) + 's', W - 16, 90);
    }
  }

  // クリアまでの進行バー（画面上部中央）
  {
    const bw = 300, bx = (W - bw) / 2, by = 14;
    const prog = clamp(game.time / CLEAR_TIME, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(bx, by, bw, 8);
    ctx.fillStyle = game.finalBossSpawned ? '#ff4be0' : theme.accent;
    ctx.fillRect(bx, by, bw * prog, 8);
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 8);
    ctx.fillStyle = '#9fb6d8'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(game.finalBossSpawned ? 'ラスボスを倒せ！' : 'クリアまで ' + Math.ceil((CLEAR_TIME - game.time)) + 's', W / 2, by + 20);
  }

  // ボス・ミニボスのHPバーを画面下部中央に大きく表示（Cycle6）
  const activeBoss = game.bossRef && !game.bossRef.dead ? game.bossRef
    : game.enemies.find(e => !e.dead && (e.boss || e.kind === 'miniboss'));
  if (activeBoss) {
    const bw = 380, bh = 18, bx2 = (W - bw) / 2, by2 = H - 44;
    const ratio = clamp(activeBoss.hp / activeBoss.maxHp, 0, 1);
    const bossColor = activeBoss.boss ? '#ff4be0' : (activeBoss.color || '#4be0ff');
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx2 - 2, by2 - 2, bw + 4, bh + 4);
    ctx.fillStyle = bossColor;
    ctx.shadowColor = bossColor; ctx.shadowBlur = 16;
    ctx.fillRect(bx2, by2, bw * ratio, bh);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1; ctx.strokeRect(bx2, by2, bw, bh);
    // HPバー上に 75% / 50% / 25% のチェックポイント縦線
    for (const cpPct of [0.75, 0.5, 0.25]) {
      const cpX = bx2 + bw * cpPct;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(cpX - 1, by2 - 1, 2, bh + 2);
    }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    const bossLabel = activeBoss.boss ? 'FINAL BOSS' : ('MINI BOSS [' + (activeBoss.bossType || '') + ']');
    ctx.fillText(bossLabel + '  ' + Math.ceil(activeBoss.hp) + ' / ' + Math.round(activeBoss.maxHp), W / 2, by2 - 6);
  }

  // ホード出現方向矢印（画面端に向けて表示、4秒間）
  if (game.hordeArrow && game.hordeArrow.life > 0) {
    game.hordeArrow.life -= 1 / 60;
    const ha = game.hordeArrow;
    const alpha = clamp(ha.life / 1.5, 0, 1);
    const cx2 = W / 2 + Math.cos(ha.angle) * (W * 0.38);
    const cy2 = H / 2 + Math.sin(ha.angle) * (H * 0.36);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx2, cy2); ctx.rotate(ha.angle);
    ctx.fillStyle = '#ff9b3d'; ctx.shadowColor = '#ff9b3d'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-10, -10); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill();
    ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.shadowBlur = 0; ctx.fillText('HORDE', 0, 20);
    ctx.restore();
  }

  // 操作ヒント（右下に小さく）。スマホはボタンを出すので文字ヒントは出さない
  if (!IS_TOUCH) {
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(150,180,210,.6)'; ctx.font = '10px sans-serif';
    ctx.fillText('P:一時停止  Tab:ステータス', W - 12, H - 12);
  } else if (state === 'playing') {
    drawTouchControls();
  }

  if (STATS) {
    ctx.textAlign = 'left'; ctx.fillStyle = '#7fffd0'; ctx.font = '11px monospace';
    ctx.fillText('E:' + game.enemies.length + ' B:' + game.bullets.length + ' EB:' + game.enemyBullets.length + ' M:' + game.mines.length + ' P:' + game.particles.length + ' upd:' + updMs.toFixed(2) + 'ms', 14, H - 14);
  }
}

// 低HP時の赤いヴィネット（画面端が赤く脈動する）
function drawDangerVignette() {
  if (!game) return;
  const p = game.player;
  const ratio = p.hp / p.maxHp;
  if (ratio >= 0.35) return;
  const t = performance.now() / 450;
  const pulse = 0.55 + 0.35 * Math.sin(t);
  const alpha = (1 - ratio / 0.35) * 0.55 * pulse;
  const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
  grad.addColorStop(0, 'rgba(200,0,0,0)');
  grad.addColorStop(1, `rgba(200,0,0,${alpha.toFixed(3)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

// 画面外の敵の方向を画面端に小さな三角で示すレーダー
function drawEnemyRadar() {
  if (!game) return;
  const p = game.player;
  const margin = 22;
  ctx.save();
  ctx.globalAlpha = 0.7;
  for (const e of game.enemies) {
    if (e.dead) continue;
    const sx = worldToScreen(e.x, e.y);
    if (sx.x >= 0 && sx.x <= W && sx.y >= 0 && sx.y <= H) continue; // 画面内は表示しない
    const angle = Math.atan2(e.y - p.y, e.x - p.x);
    // 画面端のクランプ位置を計算
    const cx = clamp(W / 2 + Math.cos(angle) * (W / 2 - margin), margin, W - margin);
    const cy = clamp(H / 2 + Math.sin(angle) * (H / 2 - margin), margin, H - margin);
    // ボス級の敵は大きく脈動するマーカーで見逃さないように（Cycle34）
    const big = e.boss || e.kind === 'miniboss';
    const sc = big ? 1.8 + 0.3 * Math.sin(performance.now() / 120) : 1;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(angle); ctx.scale(sc, sc);
    ctx.fillStyle = e.boss ? '#ff4be0' : (e.kind === 'miniboss' ? '#ffd23f' : '#ff6b6b');
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = big ? 14 : 6;
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // 画面外の宝箱の方向を金色のひし形で示す（Cycle26：取り逃し防止）
  for (const ch of game.chests) {
    const sx = worldToScreen(ch.x, ch.y);
    if (sx.x >= 0 && sx.x <= W && sx.y >= 0 && sx.y <= H) continue;
    const angle = Math.atan2(ch.y - p.y, ch.x - p.x);
    const cx = clamp(W / 2 + Math.cos(angle) * (W / 2 - margin), margin, W - margin);
    const cy = clamp(H / 2 + Math.sin(angle) * (H / 2 - margin), margin, H - margin);
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd23f'; ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 8;
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();
  }
  ctx.restore();
}

// スマホ用の操作UI（バーチャルスティック＋右下のボタン）を描く
function drawTouchControls() {
  ctx.save();
  // --- バーチャルスティック（操作中だけ表示） ---
  if (stick.active) {
    const bx = stick.baseX, by = stick.baseY;
    // 土台のリング
    ctx.beginPath(); ctx.arc(bx, by, STICK_MAX, 0, TAU);
    ctx.fillStyle = 'rgba(20,40,70,.30)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(120,180,255,.45)'; ctx.stroke();
    // ノブ（指の方向へ）
    const kx = bx + stick.nx * stick.mag * STICK_MAX;
    const ky = by + stick.ny * stick.mag * STICK_MAX;
    ctx.beginPath(); ctx.arc(kx, ky, 26, 0, TAU);
    ctx.fillStyle = 'rgba(92,240,255,.85)';
    ctx.shadowColor = '#5cf0ff'; ctx.shadowBlur = 18; ctx.fill();
    ctx.shadowBlur = 0;
  }
  // --- 右下ボタン（一時停止・サウンド） ---
  ctx.lineWidth = 2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // 一時停止
  const pb = mobBtn.pause;
  ctx.beginPath(); ctx.arc(pb.x, pb.y, pb.r, 0, TAU);
  ctx.fillStyle = 'rgba(10,18,34,.66)'; ctx.fill();
  ctx.strokeStyle = 'rgba(120,180,255,.6)'; ctx.stroke();
  ctx.fillStyle = '#cfe8ff';
  ctx.fillRect(pb.x - 7, pb.y - 8, 5, 16); ctx.fillRect(pb.x + 2, pb.y - 8, 5, 16);
  // サウンド
  const sb = mobBtn.sound;
  ctx.beginPath(); ctx.arc(sb.x, sb.y, sb.r, 0, TAU);
  ctx.fillStyle = 'rgba(10,18,34,.66)'; ctx.fill();
  ctx.strokeStyle = 'rgba(120,180,255,.6)'; ctx.stroke();
  ctx.fillStyle = '#cfe8ff';
  // スピーカー本体
  ctx.beginPath();
  ctx.moveTo(sb.x - 9, sb.y - 4); ctx.lineTo(sb.x - 4, sb.y - 4); ctx.lineTo(sb.x + 1, sb.y - 9);
  ctx.lineTo(sb.x + 1, sb.y + 9); ctx.lineTo(sb.x - 4, sb.y + 4); ctx.lineTo(sb.x - 9, sb.y + 4); ctx.closePath(); ctx.fill();
  if (Sound.isMuted()) { // ミュート時は×
    ctx.strokeStyle = '#ff6a8a'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(sb.x + 5, sb.y - 6); ctx.lineTo(sb.x + 13, sb.y + 6); ctx.moveTo(sb.x + 13, sb.y - 6); ctx.lineTo(sb.x + 5, sb.y + 6); ctx.stroke();
  } else {           // 再生中は音波
    ctx.strokeStyle = '#cfe8ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sb.x + 4, sb.y, 5, -0.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(sb.x + 4, sb.y, 9, -0.9, 0.9); ctx.stroke();
  }
  // スキルボタン（宝箱で入手後のみ表示）：クールダウン中は扇形で残りを表示、準備完了で発光
  const pl = game.player;
  if (pl.activeSkill) {
    const db = mobBtn.dash;
    const dashMaxT = 6 * pl.skillCdMul;
    const dashOK = pl.dashCd <= 0;
    ctx.beginPath(); ctx.arc(db.x, db.y, db.r, 0, TAU);
    ctx.fillStyle = dashOK ? 'rgba(18,58,80,.75)' : 'rgba(10,18,34,.6)'; ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = dashOK ? '#5cf0ff' : 'rgba(120,180,255,.35)';
    if (dashOK) { ctx.shadowColor = '#5cf0ff'; ctx.shadowBlur = 14; }
    ctx.stroke(); ctx.shadowBlur = 0;
    if (!dashOK) {
      const frac = clamp(pl.dashCd / dashMaxT, 0, 1);
      ctx.beginPath(); ctx.moveTo(db.x, db.y);
      ctx.arc(db.x, db.y, db.r - 3, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      ctx.closePath(); ctx.fillStyle = 'rgba(90,140,255,.28)'; ctx.fill();
    }
    ctx.fillStyle = dashOK ? '#cffcff' : 'rgba(190,220,255,.45)';
    ctx.font = 'bold 32px sans-serif'; // ボタン拡大に合わせてアイコンも大きく（ユーザー要望）
    ctx.fillText('⚡', db.x, db.y - 4);
    // スキル段階（宝箱で進化した回数）をボタン下部に小さく表示
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = dashOK ? '#8adfff' : 'rgba(140,190,230,.5)';
    ctx.fillText('Lv' + pl.skillLv, db.x, db.y + 26);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function drawBanner() {
  if (!game.banner) return;
  const b = game.banner;
  const a = clamp(b.life / b.max, 0, 1);
  const grow = b.life > b.max - 0.3 ? (b.max - b.life) / 0.3 : 1;
  ctx.save();
  ctx.globalAlpha = Math.min(1, a * 1.6);
  ctx.textAlign = 'center';
  ctx.fillStyle = b.color; ctx.shadowColor = b.color; ctx.shadowBlur = 22;
  ctx.font = 'bold ' + Math.round(40 * (0.7 + grow * 0.3)) + 'px "Segoe UI", sans-serif';
  ctx.fillText(b.text, W / 2, 150);
  if (b.sub) { ctx.shadowBlur = 0; ctx.fillStyle = '#cfe8ff'; ctx.font = '16px sans-serif'; ctx.fillText(b.sub, W / 2, 178); }
  ctx.restore();
}

// ---- タイトル画面 ----
function drawTitle() {
  dimScreen(0.55);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5cf0ff'; ctx.shadowColor = '#5cf0ff'; ctx.shadowBlur = 24;
  ctx.font = 'bold 56px "Segoe UI", sans-serif';
  ctx.fillText('NEON SURVIVOR', W / 2, H / 2 - 92);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#cfe8ff'; ctx.font = '16px sans-serif';
  if (IS_TOUCH) {
    ctx.fillText('画面に指で触れるとスティックが出ます。動かすだけ（攻撃は自動）。', W / 2, H / 2 - 38);
    ctx.fillText('敵を倒してレベルアップ → 出てくる3枚から強化を選ぼう。武器はレベルで進化！', W / 2, H / 2 - 14);
    ctx.fillStyle = '#9fb6d8'; ctx.font = '13px sans-serif';
    ctx.fillText('右下ボタン：一時停止／サウンド。宝箱を開けるたびスキル（⚡）が進化する！', W / 2, H / 2 + 8);
  } else {
    ctx.fillText('WASD / 矢印キーで移動（攻撃は自動）。マウス長押しでも移動できます。', W / 2, H / 2 - 38);
    ctx.fillText('敵を倒してレベルアップ → 強化を選んで強くなろう。武器はレベルを上げると進化！', W / 2, H / 2 - 14);
    ctx.fillStyle = '#9fb6d8'; ctx.font = '13px sans-serif';
    ctx.fillText('P：一時停止　Tab：ステータス確認　Space：スキル発動（🎁宝箱で進化）', W / 2, H / 2 + 8);
  }
  ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 15px sans-serif';
  ctx.fillText('★ 目標：9分耐えてラスボスを倒すとクリア！', W / 2, H / 2 + 36);
  ctx.fillStyle = '#8affc1'; ctx.font = 'bold 20px sans-serif';
  const blink = (Math.floor(Date.now() / 500) % 2) === 0;
  if (blink) ctx.fillText(IS_TOUCH ? '▶ タップでスタート' : '▶ クリック / スペースキー でスタート', W / 2, H / 2 + 78);
  const bestY = H / 2 + 130;
  if (best > 0) { ctx.fillStyle = '#8affc1'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('BEST SCORE ' + best, W / 2, bestY); }
  if (totalDeaths > 0) { ctx.fillStyle = '#9fb6d8'; ctx.font = '13px sans-serif'; ctx.fillText('💀 通算死亡 ' + totalDeaths + ' 回', W / 2, bestY + 24); }
  if (!IS_TOUCH) { ctx.fillStyle = '#6a7fa0'; ctx.font = '12px sans-serif'; ctx.fillText('M キーで効果音オン/オフ', W / 2, H - 20); }
}

// ---- レベルアップの3択 ----
const cardRects = [];
const rerollBtnRect = { x: 0, y: 0, w: 0, h: 0 };
const statusRestartRect = { x: 0, y: 0, w: 0, h: 0 };  // スマホ用「最初から」ボタン（Cycle24）
const goContinueRect = { x: 0, y: 0, w: 0, h: 0 };     // ゲームオーバー画面の「コンティニュー」ボタン
const goRestartRect = { x: 0, y: 0, w: 0, h: 0 };      // ゲームオーバー画面の「最初から」ボタン
function drawLevelUp() {
  dimScreen(0.6);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8affc1'; ctx.shadowColor = '#8affc1'; ctx.shadowBlur = 18;
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('LEVEL UP!', W / 2, 120);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#cfe8ff'; ctx.font = '14px sans-serif';
  ctx.fillText('強化を1つ選択（クリック または 1 / 2 / 3 キー）', W / 2, 150);

  cardRects.length = 0;
  // スマホではカードと引き直しボタンをひと回り大きく（タップしやすく）
  const cw = IS_TOUCH ? 258 : 220, ch = IS_TOUCH ? 268 : 230, gap = IS_TOUCH ? 18 : 28;
  const fs = IS_TOUCH ? 1.12 : 1; // フォント拡大率
  const total = game.choices.length * cw + (game.choices.length - 1) * gap;
  let x0 = (W - total) / 2;
  const y0 = 172;
  for (let i = 0; i < game.choices.length; i++) {
    const c = game.choices[i];
    const x = x0 + i * (cw + gap);
    const hovered = pointer.x >= x && pointer.x <= x + cw && pointer.y >= y0 && pointer.y <= y0 + ch;
    ctx.fillStyle = hovered ? 'rgba(40,70,120,.95)' : 'rgba(20,30,55,.92)';
    ctx.strokeStyle = c.isEvo ? '#ffd23f' : (c.isNew ? '#8affc1' : '#5c8aff');
    ctx.lineWidth = c.isEvo ? 3 : 2;
    roundRect(x, y0, cw, ch, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = Math.round(46 * fs) + 'px sans-serif';
    ctx.fillText(c.icon, x + cw / 2, y0 + 76);
    ctx.fillStyle = c.isEvo ? '#ffd23f' : (c.isNew ? '#8affc1' : '#eaffff'); ctx.font = 'bold ' + Math.round(19 * fs) + 'px sans-serif';
    ctx.fillText(c.name, x + cw / 2, y0 + 118);
    if (c.isEvo) { ctx.fillStyle = '#ffd23f'; ctx.font = 'bold ' + Math.round(12 * fs) + 'px sans-serif'; ctx.fillText('★ EVOLUTION', x + cw / 2, y0 + 140); }
    else if (c.isNew) { ctx.fillStyle = '#8affc1'; ctx.font = 'bold ' + Math.round(12 * fs) + 'px sans-serif'; ctx.fillText('+ NEW', x + cw / 2, y0 + 140); }
    else {
      // Cycle23: 現在値バッジ。上限付きは「いま→次(最大)」、それ以外は取得回数
      const taken = (game.player.upgradeCount && game.player.upgradeCount[c.id]) || 0;
      let tag = '';
      if (c.max && c.lvOf) tag = c.lvOf() + ' → ' + (c.lvOf() + 1) + '（最大 ' + c.max + '）';
      else if (taken > 0) tag = '取得済 ×' + taken;
      if (tag) { ctx.fillStyle = '#7f93b5'; ctx.font = 'bold ' + Math.round(12 * fs) + 'px sans-serif'; ctx.fillText(tag, x + cw / 2, y0 + 140); }
    }
    ctx.fillStyle = '#bcd2f0'; ctx.font = Math.round(14 * fs) + 'px sans-serif';
    wrapText(c.desc, x + cw / 2, y0 + 168, cw - 28, Math.round(19 * fs));
    // 系統表示：進化して名前が変わっても「元はどの武器か」が分かるようにする
    const famKey = c.id ? c.id.split('_')[0] : '';
    if (WEAPON_META[famKey]) {
      ctx.fillStyle = '#7f93b5'; ctx.font = Math.round(11 * fs) + 'px sans-serif';
      ctx.fillText('系統: ' + WEAPON_META[famKey].icon + ' ' + WEAPON_META[famKey].base, x + cw / 2, y0 + ch - 32);
    }
    ctx.fillStyle = '#6a7fa0'; ctx.font = 'bold ' + Math.round(13 * fs) + 'px sans-serif';
    ctx.fillText('[ ' + (i + 1) + ' ]', x + cw / 2, y0 + ch - 16);
    cardRects.push({ x, y: y0, w: cw, h: ch, idx: i });
  }

  // リロールボタン（Cycle10）：スマホでは大きめにしてタップしやすく
  const rbw = IS_TOUCH ? 240 : 180, rbh = IS_TOUCH ? 56 : 38, rbx = (W - rbw) / 2, rby = y0 + ch + 18;
  const canReroll = game.rerollsLeft > 0;
  const hoverRb = pointer.x >= rbx && pointer.x <= rbx + rbw && pointer.y >= rby && pointer.y <= rby + rbh;
  ctx.fillStyle = canReroll ? (hoverRb ? 'rgba(90,140,255,.95)' : 'rgba(40,70,140,.88)') : 'rgba(40,40,60,.6)';
  ctx.strokeStyle = canReroll ? '#5c8aff' : '#384060';
  ctx.lineWidth = 2;
  roundRect(rbx, rby, rbw, rbh, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = canReroll ? '#cfe8ff' : '#5a6a80';
  ctx.font = 'bold ' + (IS_TOUCH ? 19 : 16) + 'px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('🔄 引き直し（残 ' + game.rerollsLeft + '）', W / 2, rby + rbh / 2 + (IS_TOUCH ? 7 : 6));
  rerollBtnRect.x = rbx; rerollBtnRect.y = rby; rerollBtnRect.w = rbw; rerollBtnRect.h = rbh;
}

// ---- 一時停止 ----
function drawPause() {
  dimScreen(0.62);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5cf0ff'; ctx.shadowColor = '#5cf0ff'; ctx.shadowBlur = 20;
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('PAUSED', W / 2, H / 2 - 10);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#cfe8ff'; ctx.font = '16px sans-serif';
  ctx.fillText('P で再開　／　Tab でステータス確認', W / 2, H / 2 + 30);
  ctx.fillStyle = '#9fb6d8'; ctx.font = '14px sans-serif';
  ctx.fillText('R：最初からやり直す　／　T：タイトルへ戻る', W / 2, H / 2 + 56);
}

// ---- ステータス画面（Tab） ----
function drawStatus() {
  dimScreen(0.8);
  const p = game.player;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5cf0ff'; ctx.shadowColor = '#5cf0ff'; ctx.shadowBlur = 16;
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('STATUS', W / 2, 56);
  ctx.shadowBlur = 0;

  // 左：プレイヤーの基本ステータス
  const lx = 70; let ly = 110;
  ctx.textAlign = 'left'; ctx.fillStyle = '#8affc1'; ctx.font = 'bold 16px sans-serif';
  ctx.fillText('◆ キャラクター', lx, ly); ly += 28;
  ctx.font = '14px sans-serif'; ctx.fillStyle = '#cfe8ff';
  const rows = [
    ['レベル', p.level],
    ['最大HP', Math.round(p.maxHp)],
    ['移動速度', Math.round(p.speed)],
    ['攻撃力倍率', '×' + p.dmgMul.toFixed(2)],
    ['会心率', Math.round(p.critChance * 100) + '%'],
    ['被ダメ軽減', Math.round(p.armor * 100) + '%'],
    ['回避率', Math.round((p.dodge || 0) * 100) + '%'],
    ['反射ダメージ', Math.round(p.thorns || 0)],
    ['毎秒回復', p.regen.toFixed(1)],
    ['XP獲得倍率', '×' + p.xpMul.toFixed(2) + (game.xpBoostTimer > 0 ? ' (+60% ' + Math.ceil(game.xpBoostTimer) + 's)' : '')],
    ['XP回収範囲', Math.round(p.pickupRange)],
  ];
  for (const [k, v] of rows) {
    ctx.fillStyle = '#9fb6d8'; ctx.fillText(k, lx, ly);
    ctx.fillStyle = '#eaffff'; ctx.textAlign = 'right'; ctx.fillText('' + v, lx + 260, ly);
    ctx.textAlign = 'left'; ly += 24;
  }

  // 右：武器一覧（アイコン＋現在名＋Lv＋威力）
  const rx = 470; let ry = 110;
  ctx.fillStyle = '#8affc1'; ctx.font = 'bold 16px sans-serif';
  ctx.fillText('◆ 武器（★＝進化済み）', rx, ry); ry += 30;
  for (const key in p.weapons) {
    const wp = p.weapons[key];
    if (wp.lv <= 0) continue;
    const m = WEAPON_META[key];
    ctx.font = '22px sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(m.icon, rx, ry + 4);
    ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = wp.evolved ? '#ffd23f' : '#eaffff';
    ctx.fillText(weaponLabel(key, wp) + (wp.evolved ? ' ★（元:' + m.base + '）' : ''), rx + 34, ry);
    // 威力（dmgがあるものは実効ダメージを概算表示）
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#9fb6d8';
    let info = 'Lv' + (wp.lv || 1);
    if (wp.dmg != null) info += '　威力 ' + Math.round(wp.dmg * p.dmgMul);
    if (key === 'bolt') info += '　弾数 ' + wp.count;
    if (key === 'orbit') info += '　数 ' + wp.count;
    if (key === 'thunder') info += '　連鎖 ' + wp.chains;
    if (key === 'mine') info += '　設置 ' + wp.max;
    ctx.fillText(info, rx + 34, ry + 16);
    if (!wp.evolved) {
      // Cycle25: 進化条件をその場で確認できるようにする（bolt=同時発射3 / orbit=衛星4 / 他=Lv4）
      const need = key === 'bolt' ? ['同時発射', wp.count, 3] : key === 'orbit' ? ['衛星の数', wp.count, 4] : ['Lv', wp.lv, 4];
      const ready = need[1] >= need[2];
      ctx.fillStyle = ready ? '#ffd23f' : '#7f93b5';
      ctx.fillText(ready ? '★ 進化カード出現中！' : '進化まで：' + need[0] + ' ' + need[1] + ' / ' + need[2], rx + 34 + ctx.measureText(info).width + 16, ry + 16);
    }
    ry += 42;
  }
  if (ry < 150) { ctx.fillStyle = '#9fb6d8'; ctx.font = '13px sans-serif'; ctx.fillText('（まだ武器の追加取得なし）', rx, ry); }

  ctx.textAlign = 'center';
  if (IS_TOUCH) {
    // Cycle24: スマホは「つづける」「最初から」ボタンをタップで選べるようにする
    const bw = 200, bh = 52, gapB = 24;
    const bx1 = W / 2 - bw - gapB / 2, bx2 = W / 2 + gapB / 2, by = H - 84;
    ctx.fillStyle = 'rgba(30,80,60,.85)'; ctx.strokeStyle = '#8affc1'; ctx.lineWidth = 2;
    roundRect(bx1, by, bw, bh, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c9ffe4'; ctx.font = 'bold 19px sans-serif';
    ctx.fillText('▶ つづける', bx1 + bw / 2, by + 33);
    ctx.fillStyle = 'rgba(80,40,50,.85)'; ctx.strokeStyle = '#ff8ca0';
    roundRect(bx2, by, bw, bh, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd7de';
    ctx.fillText('↻ 最初から', bx2 + bw / 2, by + 33);
    statusRestartRect.x = bx2; statusRestartRect.y = by; statusRestartRect.w = bw; statusRestartRect.h = bh;
  } else {
    statusRestartRect.w = 0;
    ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 15px sans-serif';
    ctx.fillText('Tab / P で戻る　／　R：最初から　T：タイトルへ', W / 2, H - 26);
  }
}

// ---- ゲームオーバー ----
function drawGameOver() {
  dimScreen(0.68);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5c7a'; ctx.shadowColor = '#ff5c7a'; ctx.shadowBlur = 22;
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText('GAME OVER', W / 2, H / 2 - 70);
  ctx.shadowBlur = 0;
  drawResultStats();
  // 死亡回数（このラン内＋通算）
  ctx.fillStyle = '#ff8ca0'; ctx.font = 'bold 14px sans-serif';
  ctx.fillText('💀 このラン ' + game.deaths + ' 回目 ／ 通算 ' + totalDeaths + ' 回', W / 2, H / 2 + 168);
  // 「コンティニュー」「最初から」の2ボタン（クリック/タップ。キーは C / R）
  const bw = 220, bh = 46, gapB = 24, by = H / 2 + 184;
  const bx1 = W / 2 - bw - gapB / 2, bx2 = W / 2 + gapB / 2;
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(30,80,60,.85)'; ctx.strokeStyle = '#8affc1';
  roundRect(bx1, by, bw, bh, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c9ffe4'; ctx.font = 'bold 18px sans-serif';
  ctx.fillText(IS_TOUCH ? '▶ コンティニュー' : '▶ コンティニュー (C)', bx1 + bw / 2, by + 30);
  ctx.fillStyle = 'rgba(80,40,50,.85)'; ctx.strokeStyle = '#ff8ca0';
  roundRect(bx2, by, bw, bh, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffd7de';
  ctx.fillText(IS_TOUCH ? '↻ 最初から' : '↻ 最初から (R)', bx2 + bw / 2, by + 30);
  goContinueRect.x = bx1; goContinueRect.y = by; goContinueRect.w = bw; goContinueRect.h = bh;
  goRestartRect.x = bx2; goRestartRect.y = by; goRestartRect.w = bw; goRestartRect.h = bh;
}

// ---- クリア（勝利）画面 ----
function drawWin() {
  dimScreen(0.7);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8affc1'; ctx.shadowColor = '#8affc1'; ctx.shadowBlur = 26;
  ctx.font = 'bold 54px sans-serif';
  ctx.fillText('YOU SURVIVED!', W / 2, H / 2 - 78);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#cfe8ff'; ctx.font = '17px sans-serif';
  ctx.fillText('ラスボス撃破！ 最後まで生き延びた！', W / 2, H / 2 - 44);
  drawResultStats();
  const blink = (Math.floor(Date.now() / 500) % 2) === 0;
  ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 18px sans-serif';
  if (blink) ctx.fillText(IS_TOUCH ? '▶ タップで もう一度' : '▶ R / クリック で もう一度', W / 2, H / 2 + 170);
}

function drawResultStats() {
  const tt = Math.floor(game.time);
  const mm = String(Math.floor(tt / 60)).padStart(2, '0');
  const ss = String(tt % 60).padStart(2, '0');
  ctx.fillStyle = '#eaffff'; ctx.font = '22px monospace';
  ctx.fillText('生存時間  ' + mm + ':' + ss, W / 2, H / 2 - 12);
  ctx.fillStyle = '#cfe8ff'; ctx.font = '17px sans-serif';
  ctx.fillText('Lv ' + game.player.level + '　撃破 ' + game.kills, W / 2, H / 2 + 16);
  const score = game.finalScore != null ? game.finalScore : computeScore();
  ctx.fillStyle = '#8affc1'; ctx.font = 'bold 26px sans-serif';
  ctx.fillText('SCORE ' + score, W / 2, H / 2 + 54);
  if (game.newBest) { ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 16px sans-serif'; ctx.fillText('★ NEW BEST! ★', W / 2, H / 2 + 76); }
  else { ctx.fillStyle = '#9fb6d8'; ctx.font = '14px sans-serif'; ctx.fillText('BEST ' + best, W / 2, H / 2 + 76); }

  // 取得していた武器一覧（進化済みは黄金で強調）
  const weapons = Object.keys(game.player.weapons).filter(k => game.player.weapons[k].lv > 0);
  if (weapons.length) {
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#9fb6d8';
    ctx.fillText('使用武器', W / 2, H / 2 + 100);
    const iconW = 36, startX = W / 2 - (weapons.length * iconW) / 2 + iconW / 2;
    for (let i = 0; i < weapons.length; i++) {
      const wp = game.player.weapons[weapons[i]];
      const evoX = startX + i * iconW;
      if (wp.evolved) {
        ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 14;
        ctx.fillStyle = '#ffd23f'; ctx.font = '9px sans-serif';
        ctx.fillText('★EVO', evoX, H / 2 + 109);
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = wp.evolved ? '#ffd23f' : '#fff'; ctx.font = '22px sans-serif';
      ctx.fillText(WEAPON_META[weapons[i]].icon, evoX, H / 2 + 126);
    }
  }
  // パッシブ特記（蘇生使用済み、アドレナリン発動など）
  const p = game.player;
  const notes = [];
  if (p.berserkLv > 0) notes.push('🔥Berserk×' + p.berserkLv);
  if (p.deathDefyLv === 0 && p.deathDefied) notes.push('⚰蘇生済');
  if (p.strikerLv > 0) notes.push('🗡️Striker×' + p.strikerLv);
  if (game.chestsOpened > 0) notes.push('🎁宝箱×' + game.chestsOpened);
  if (game.deaths > 0) notes.push('💀死亡×' + game.deaths);
  if (notes.length) { ctx.font = '11px sans-serif'; ctx.fillStyle = '#c8a0ff'; ctx.fillText(notes.join('  '), W / 2, H / 2 + 144); }
}

// ---- 宝箱アイテムの説明カード（獲得時に一時停止して表示。任意の操作で再開） ----
function drawChestCard() {
  const item = game.chestCard;
  if (!item) { state = 'playing'; return; }
  dimScreen(0.6);
  const cw = 420, chh = 240, cx = W / 2 - cw / 2, cy = H / 2 - chh / 2;
  ctx.fillStyle = 'rgba(24,20,6,.92)'; ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3;
  roundRect(cx, cy, cw, chh, 16); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 18px sans-serif';
  ctx.fillText('🎁 宝箱アイテム GET!', W / 2, cy + 36);
  ctx.font = '44px sans-serif';
  ctx.fillText(item.icon, W / 2, cy + 92);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif';
  ctx.fillText(item.name, W / 2, cy + 128);
  ctx.fillStyle = '#cfe8ff'; ctx.font = '14px sans-serif';
  wrapText(item.desc, W / 2, cy + 158, 380, 20);
  const blink = (Math.floor(Date.now() / 500) % 2) === 0;
  if (blink) {
    ctx.fillStyle = '#8affc1'; ctx.font = 'bold 14px sans-serif';
    ctx.fillText(IS_TOUCH ? '▶ タップで再開' : '▶ クリック / 任意のキーで再開', W / 2, cy + chh - 18);
  }
}

// ---- 描画ヘルパ ----
function dimScreen(a) { ctx.fillStyle = 'rgba(3,5,12,' + a + ')'; ctx.fillRect(0, 0, W, H); }
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapText(text, cx, y, maxW, lh) {
  const words = text.split('');
  let line = '', yy = y;
  for (const ch of words) {
    if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, cx, yy); line = ch; yy += lh; }
    else line += ch;
  }
  ctx.fillText(line, cx, yy);
}

// =========================================================================
//  メニュー操作（クリック / キー）
// =========================================================================
function handleMenuKey(k) {
  // 宝箱アイテムの説明カードは任意のキーで閉じて再開
  if (state === 'chestitem') { game.chestCard = null; state = 'playing'; return; }
  // 一時停止／ステータスはプレイ中の共通トグル
  if (k === 'p') {
    if (state === 'playing') { state = 'paused'; Sound.pause(); }
    else if (state === 'paused' || state === 'status') { state = 'playing'; Sound.pause(); }
    return;
  }
  if (k === 'tab') {
    if (state === 'playing' || state === 'paused') state = 'status'; // 停止中もタブでステータス
    else if (state === 'status') state = 'playing';
    return;
  }
  if (state === 'title') {
    if (k === ' ' || k === 'enter') startGame('normal');
  } else if (state === 'gameover') {
    // C / Space / Enter＝その場からコンティニュー、R＝最初から
    if (k === 'c' || k === ' ' || k === 'enter') continueRun();
    else if (k === 'r') startGame('normal');
  } else if (state === 'win') {
    if (k === 'r' || k === ' ' || k === 'enter') startGame('normal');
  } else if (state === 'playing') {
    // Space でアクティブスキル発動（宝箱で入手するまでは何も起きない）
    if (k === ' ') tryDash();
  } else if (state === 'paused' || state === 'status') {
    // Cycle24: 停止中から R＝やり直し／T＝タイトルへ
    if (k === 'r') startGame('normal');
    else if (k === 't') { state = 'title'; Sound.pause(); }
  } else if (state === 'levelup') {
    if (k === '1') applyChoice(0);
    else if (k === '2') applyChoice(1);
    else if (k === '3') applyChoice(2);
    else if (k === 'r') rerollChoices();
  }
}
// 矩形の中をポイントしているか（ボタンのタップ判定に使う）
function inRect(r) { return r.w > 0 && pointer.x >= r.x && pointer.x <= r.x + r.w && pointer.y >= r.y && pointer.y <= r.y + r.h; }
function handleClick() {
  // 宝箱アイテムの説明カードはクリック/タップで閉じて再開
  if (state === 'chestitem') { game.chestCard = null; state = 'playing'; return; }
  if (state === 'title') startGame('normal');
  else if (state === 'win') startGame('normal');
  else if (state === 'gameover') {
    // ボタンの外をタップしても何も起きない（うっかり「最初から」を防ぐ）
    if (inRect(goContinueRect)) continueRun();
    else if (inRect(goRestartRect)) startGame('normal');
  }
  else if (state === 'status' && inRect(statusRestartRect)) startGame('normal'); // Cycle24: 「最初から」ボタン
  else if (state === 'paused' || state === 'status') { state = 'playing'; pointer.down = false; }
  else if (state === 'levelup') {
    // リロールボタンのクリック判定
    const rb = rerollBtnRect;
    if (game.rerollsLeft > 0 && pointer.x >= rb.x && pointer.x <= rb.x + rb.w && pointer.y >= rb.y && pointer.y <= rb.y + rb.h) {
      rerollChoices(); return;
    }
    for (const c of cardRects) {
      if (pointer.x >= c.x && pointer.x <= c.x + c.w && pointer.y >= c.y && pointer.y <= c.y + c.h) { applyChoice(c.idx); break; }
    }
  }
}

function startGame(mode) {
  Sound.resume();
  resetGame(mode);
  state = 'playing';
}

// =========================================================================
//  メインループ（固定タイムステップ + 早送り対応）
// =========================================================================
let last = performance.now();
let acc = 0;
let updMs = 0;
// スマホは120Hz等の高リフレッシュレート機種で無駄に描画回数が増え発熱の原因になるため、描画のみ60fpsに制限する
// （物理更新はrAFの実dtに追従したままなので、動きの正しさ・早送りは変わらない・ユーザー要望）
let lastRenderAt = 0;
const RENDER_INTERVAL = IS_TOUCH ? 1000 / 60 : 0;
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  if (pointer.clicked) { handleClick(); pointer.clicked = false; }
  if (DEMO && state === 'levelup') applyChoice((Math.random() * game.choices.length) | 0);
  if (DEMO && state === 'chestitem') { game.chestCard = null; state = 'playing'; }

  if (state === 'playing') {
    acc += dt;
    let steps = 0;
    const t0 = performance.now();
    while (acc >= STEP && steps < 8 * FAST) {
      for (let f = 0; f < FAST; f++) { if (state === 'playing') update(STEP); }
      acc -= STEP;
      steps++;
    }
    if (steps > 0) updMs = updMs * 0.85 + ((performance.now() - t0) / steps) * 0.15;
  } else {
    acc = 0; // ポーズ等から復帰したとき時間がワープしないように
  }

  if (RENDER_INTERVAL === 0 || now - lastRenderAt >= RENDER_INTERVAL) {
    render();
    lastRenderAt = now;
  }
  requestAnimationFrame(frame);
}

// 自動開始（検証用）
if (AUTOSTART) {
  startGame('normal');
  if (WARP > 0) {
    const steps = Math.floor(WARP / STEP);
    for (let i = 0; i < steps; i++) {
      if (state === 'levelup') {
        if (DEMO) applyChoice((Math.random() * game.choices.length) | 0);
        else break;
      }
      if (state === 'chestitem') { game.chestCard = null; state = 'playing'; } // 宝箱カードは自動で閉じて続行
      if (state === 'gameover' || state === 'win') break;
      if (state === 'playing') update(STEP);
    }
  }
  if (Q.get('killme') === '1' && state === 'playing') { game.player.hp = 0; gameOver(); }
}

requestAnimationFrame(frame);
