// 너구리 (1982 Sigma "Ponpoko"류 오마주 미니게임)
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 480, H = 640;
// 화면 배율만큼 크게 그려서 휴대폰에서도 선명하게
const DPR = Math.min(2, window.devicePixelRatio || 1);
canvas.width = W * DPR; canvas.height = H * DPR;
ctx.scale(DPR, DPR);

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const titleEl = document.getElementById('title');
const msgEl = document.getElementById('msg');

const FOODS = ['🥕','🍒','🍄','🍊','🌽','🍍','🍉','🍆','🍈','🌰','🍌','🍓','🍑','🥔','🍎','🍇','🥜','🍐','🫘','🍺'];
const FLOORS = 5, COLS = 12, CW = W / COLS;
const floorY = (f) => 190 + f * 95;
const ladderTop = (g) => floorY(g), ladderBot = (g) => floorY(g + 1);

let state = 'ready', stage = 1, score = 0, lives = 3, timeLeft = 0;
// 최고 점수: 로비 카드와 '내 기록' 요약이 읽는다 (새 기록이 나오는 순간 바로 저장해서 중간에 나가도 남는다)
const BEST_KEY = 'neoguriBest';
let best = 0;
try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch (_) {}
function saveBest() {
  if (score <= best) return false;
  best = score;
  try { localStorage.setItem(BEST_KEY, String(best)); } catch (_) {}
  return true;
}
let invuln = 0, gaps = [], jumpReq = false, p, ladders, foods, pots, tacks, bugs, snake, msgTimer = 0, flash = '';
const keys = {};

function rnd(seed) { let s = seed * 9301 + 49297; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }

function buildStage() {
  const r = rnd(stage * 7 + 3);
  ladders = [];
  for (let g = 0; g < FLOORS - 1; g++) {
    const used = new Set();
    const n = 2 + (r() < 0.5 ? 1 : 0);
    while (used.size < n) used.add(1 + Math.floor(r() * (COLS - 2)));
    used.forEach((c) => ladders.push({ g, x: c * CW + CW / 2 }));
  }
  gaps = [];
  for (let f = 0; f < FLOORS; f++) {
    gaps[f] = [];
    if (f === FLOORS - 1) continue;
    const n = 1 + (r() < 0.5 ? 1 : 0);
    for (let t = 0; t < 30 && gaps[f].length < n; t++) {
      const x0 = 60 + r() * (W - 180), x1 = x0 + 56;
      const nearLadder = ladders.some((l) => (l.g === f || l.g === f - 1) && l.x > x0 - 30 && l.x < x1 + 30);
      const overlap = gaps[f].some((g) => x1 + 50 > g.x0 && x0 - 50 < g.x1);
      if (!nearLadder && !overlap) gaps[f].push({ x0, x1 });
    }
  }
  const occupied = {};
  const freeCol = (f) => {
    for (let t = 0; t < 50; t++) {
      const c = Math.floor(r() * COLS);
      const x = c * CW + CW / 2;
      const key = f + ':' + c;
      const inHole = inGap(f, x, 30);
      const onLadder = ladders.some((l) => (l.g === f || l.g === f - 1) && Math.abs(l.x - x) < CW);
      if (!occupied[key] && !onLadder && !inHole) { occupied[key] = 1; return x; }
    }
    return CW / 2;
  };
  foods = []; pots = []; tacks = []; bugs = [];
  for (let f = 0; f < FLOORS; f++) {
    for (let i = 0; i < 3; i++) foods.push({ f, x: freeCol(f), eaten: false });
  }
  for (let i = 0; i < 2; i++) pots.push({ f: 1 + Math.floor(r() * 4), x: freeCol(1 + Math.floor(r() * 4)), used: false });
  pots.forEach((q) => { q.x = freeCol(q.f); });
  const nt = Math.min(Math.floor(stage / 3), 4);
  for (let i = 0; i < nt; i++) { const f = 1 + Math.floor(r() * 4); tacks.push({ f, x: freeCol(f) }); }
  const nb = Math.min(3 + Math.floor(stage / 3), 7);
  for (let i = 0; i < nb; i++) {
    const f = i % (FLOORS - 1);
    let bx = r() * (W - 40) + 20;
    while (inGap(f, bx, 20)) bx = r() * (W - 40) + 20;
    if (f === FLOORS - 1 && Math.abs(bx - W / 2) < 90) bx = bx < W / 2 ? 40 : W - 40;
    bugs.push({ f, x: bx, dir: r() < 0.5 ? -1 : 1, sp: 30 + Math.min(stage, 30) });
  }
  snake = null;
  p = { x: W / 2, y: floorY(FLOORS - 1), f: FLOORS - 1, ladder: null, face: 1, jt: -1, jy: 0, fall: false };
  timeLeft = Math.max(60, 100 - stage);
  invuln = 2;
}

const inGap = (f, x, m = 0) => (gaps[f] || []).some((g) => x > g.x0 - m && x < g.x1 + m);

function ladderAt(x, y, dirUp) {
  // 현재 발 위치(y)에서 위/아래로 이어지는 사다리 탐색
  for (const l of ladders) {
    if (Math.abs(l.x - x) > 14) continue;
    if (dirUp && Math.abs(y - ladderBot(l.g)) < 1) return l;
    if (dirUp && y < ladderBot(l.g) && y > ladderTop(l.g)) return l;
    if (!dirUp && Math.abs(y - ladderTop(l.g)) < 1) return l;
    if (!dirUp && y > ladderTop(l.g) && y < ladderBot(l.g)) return l;
  }
  return null;
}

function start(reset) {
  if (reset) { stage = 1; score = 0; lives = 5; }
  buildStage();
  state = 'playing';
  overlay.classList.add('hidden');
}

function loseLife() {
  if (invuln > 0) return;
  lives--;
  flash = '💥';
  msgTimer = 0.8;
  if (lives <= 0) { end(false); return; }
  p.x = W / 2; p.y = floorY(FLOORS - 1); p.f = FLOORS - 1; p.ladder = null; p.jt = -1; p.jy = 0; p.fall = false;
  snake = null;
  invuln = 2;
}

function end(win) {
  state = 'over';
  const isBest = score > 0 && score >= best;
  saveBest();
  titleEl.textContent = '게임 오버';
  msgEl.innerHTML = `스테이지 ${stage} · 점수 ${score}<br>${isBest ? '🏆 최고 기록!' : `최고 기록 ${best}`}`;
  startBtn.textContent = '다시 하기';
  overlay.classList.remove('hidden');
}

function update(dt) {
  timeLeft -= dt;
  if (timeLeft <= 0) { loseLife(); timeLeft = Math.max(60, 100 - stage); return; }
  if (msgTimer > 0) msgTimer -= dt;
  if (invuln > 0) invuln -= dt;

  const SP = 150, CL = 120, JT = 0.6, JH = 32;
  const left = keys.ArrowLeft, right = keys.ArrowRight, up = keys.ArrowUp, down = keys.ArrowDown;
  const jumping = p.jt >= 0;
  if (p.fall) {
    p.y += 260 * dt;
    if (p.y >= floorY(p.f + 1)) { p.f++; p.y = floorY(p.f); p.fall = false; }
  } else if (p.ladder) {
    const l = p.ladder;
    if (up) p.y -= CL * dt; else if (down) p.y += CL * dt;
    if (p.y <= ladderTop(l.g)) { p.y = ladderTop(l.g); p.f = l.g; p.ladder = null; }
    else if (p.y >= ladderBot(l.g)) { p.y = ladderBot(l.g); p.f = l.g + 1; p.ladder = null; }
  } else {
    if (!jumping && (up || down)) {
      const l = ladderAt(p.x, p.y, !!up);
      const okUp = up && l && l.g === p.f - 1, okDown = down && l && l.g === p.f;
      if (okUp || okDown) { p.ladder = l; p.x = l.x; }
    }
    if (!p.ladder) {
      if (left) { p.x -= SP * dt; p.face = -1; }
      if (right) { p.x += SP * dt; p.face = 1; }
      p.x = Math.max(16, Math.min(W - 16, p.x));
      if (jumpReq && !jumping) p.jt = 0;
      if (p.jt >= 0) {
        p.jt += dt;
        const k = p.jt / JT;
        if (k >= 1) { p.jt = -1; p.jy = 0; } else p.jy = 4 * JH * k * (1 - k);
      }
      if (p.jt < 0 && inGap(p.f, p.x, -8) && p.f < FLOORS - 1) { p.fall = true; timeLeft -= 5; flash = '-5초'; msgTimer = 0.8; }
    }
  }
  jumpReq = false;
  const air = p.jy > 16;

  // 음식
  if (!p.ladder && !p.fall) foods.forEach((fd) => {
    if (!fd.eaten && fd.f === p.f && Math.abs(fd.x - p.x) < 20 && !air) { fd.eaten = true; score += 100; }
  });
  // 항아리
  if (!p.ladder && !p.fall && !air) pots.forEach((q) => {
    if (!q.used && q.f === p.f && Math.abs(q.x - p.x) < 20) {
      q.used = true;
      if (Math.random() < 0.7) { score += 500; flash = '+500'; msgTimer = 0.8; }
      else snake = { f: q.f, x: q.x, y: floorY(q.f), ladder: null, life: 6, sp: 45 + stage };
    }
  });
  // 압정
  if (!p.ladder && !p.fall && !air && tacks.some((t) => t.f === p.f && Math.abs(t.x - p.x) < 14)) { loseLife(); return; }
  // 지네
  bugs.forEach((b) => {
    const nx = b.x + b.dir * b.sp * dt;
    if (inGap(b.f, nx, 0)) b.dir *= -1; else b.x = nx;
    if (b.x < 16) { b.x = 16; b.dir = 1; }
    if (b.x > W - 16) { b.x = W - 16; b.dir = -1; }
  });
  if (!p.ladder && !p.fall && !air && bugs.some((b) => b.f === p.f && Math.abs(b.x - p.x) < 16)) { loseLife(); return; }

  // 뱀
  if (snake) {
    const s = snake;
    s.life -= dt;
    if (s.life <= 0) snake = null;
    else {
      const pf = p.ladder ? p.ladder.g + 0.5 : p.f;
      if (s.ladder) {
        const l = s.ladder, dirUp = pf < s.f;
        s.y += (dirUp ? -1 : 1) * 80 * dt;
        if (s.y <= ladderTop(l.g)) { s.y = ladderTop(l.g); s.f = l.g; s.ladder = null; }
        else if (s.y >= ladderBot(l.g)) { s.y = ladderBot(l.g); s.f = l.g + 1; s.ladder = null; }
      } else if (Math.floor(pf) === s.f && Number.isInteger(pf)) {
        s.x += Math.sign(p.x - s.x) * s.sp * dt;
      } else {
        const dirUp = pf < s.f;
        const cand = ladders.filter((l) => l.g === (dirUp ? s.f - 1 : s.f));
        if (cand.length) {
          const l = cand.reduce((a, b) => (Math.abs(a.x - s.x) < Math.abs(b.x - s.x) ? a : b));
          if (Math.abs(l.x - s.x) < 3) { s.x = l.x; s.ladder = l; }
          else s.x += Math.sign(l.x - s.x) * s.sp * dt;
        }
      }
      if (!p.fall && !air && Math.abs(s.x - p.x) < 16 && Math.abs(s.y - p.y) < 24) { loseLife(); return; }
    }
  }

  if (foods.every((f) => f.eaten)) {
    score += Math.floor(timeLeft) * 10;
    stage++;
    if (stage > 20) stage = 20; // 마지막 스테이지 반복
    buildStage();
    flash = 'STAGE ' + stage; msgTimer = 1.2;
  }
}

// ---------- 그리기 (작은 오락실 공통 스티커 스타일: 진한 테두리 + 아래 그림자 + Jua) ----------
const INK = '#2b1d52';
const FONT = '"Jua", "Apple SD Gothic Neo", sans-serif';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function panel(x, y, w, h, r, fill, lift = 4) {
  ctx.fillStyle = INK; roundRect(x, y + lift, w, h, r); ctx.fill();
  ctx.fillStyle = fill; roundRect(x, y, w, h, r); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; roundRect(x, y, w, h, r); ctx.stroke();
}
function label(text, x, y, size, fill = '#fff', align = 'center') {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.22); ctx.strokeStyle = INK; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
// 발밑 그림자 + 이모지
function sprite(e, x, y, size, shadow = true) {
  if (shadow) {
    ctx.fillStyle = 'rgba(43,29,82,.35)';
    ctx.beginPath(); ctx.ellipse(x, y + size * 0.48, size * 0.36, size * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = `${size}px ${EMOJI}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';   // 컬러 이모지도 채우기 색의 투명도를 따라가므로 불투명하게 (그림자 색이 남아 있으면 흐려진다)
  ctx.fillText(e, x, y);
}
function cloud(cx, cy, s) {
  const bumps = [[-1.1, 0.25, 0.55], [-0.45, -0.15, 0.75], [0.35, -0.05, 0.7], [1.0, 0.3, 0.5]];
  for (const pass of [0, 1, 2]) for (const [bx, by, br] of bumps) {
    ctx.beginPath();
    ctx.arc(cx + bx * s, cy + by * s + (pass === 0 ? 4 : 0), br * s + (pass === 1 ? 3 : 0), 0, Math.PI * 2);
    ctx.fillStyle = pass === 2 ? 'rgba(255,255,255,.9)' : INK;
    ctx.globalAlpha = pass === 2 ? 1 : 0.35;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHud() {
  const maxT = Math.max(60, 100 - stage);
  panel(12, 10, 150, 40, 20, '#ffd23f');
  sprite('⭐', 34, 30, 20, false);
  label(score.toLocaleString(), 100, 30, 22);
  panel(W / 2 - 62, 10, 124, 40, 20, '#ffffff');
  label(`STAGE ${stage}`, W / 2 - 12, 30, 17, INK, 'center');
  sprite(FOODS[(stage - 1) % FOODS.length], W / 2 + 44, 30, 20, false);
  panel(W - 132, 10, 120, 40, 20, '#ffffff');
  const n = Math.max(lives, 0);
  for (let i = 0; i < Math.min(n, 5); i++) sprite('🦝', W - 112 + i * 20, 30, 18, false);
  // 남은 시간
  panel(12, 62, W - 24, 20, 10, '#ffffff', 3);
  const tr = Math.max(timeLeft, 0) / maxT;
  const g = ctx.createLinearGradient(0, 65, 0, 79);
  g.addColorStop(0, timeLeft < 10 ? '#ff8a8a' : '#7dffb0');
  g.addColorStop(1, timeLeft < 10 ? '#ff3b5c' : '#1fc46b');
  ctx.fillStyle = g;
  roundRect(15, 65, Math.max(14, (W - 30) * tr), 14, 7); ctx.fill();
}

function drawFloor(f) {
  const y = floorY(f);
  let x = 0;
  const pieces = [];
  [...(gaps[f] || [])].sort((a, b) => a.x0 - b.x0).forEach((g) => { pieces.push([x, g.x0]); x = g.x1; });
  pieces.push([x, W]);
  for (const [x0, x1] of pieces) {
    if (x1 - x0 < 2) continue;
    // 나무 널빤지: 테두리, 위 밝게 아래 진하게, 이음매
    ctx.fillStyle = INK; roundRect(x0 - 2, y + 2, x1 - x0 + 4, 16, 6); ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + 14);
    g.addColorStop(0, '#f0b574'); g.addColorStop(1, '#b8713a');
    ctx.fillStyle = g; roundRect(x0, y, x1 - x0, 14, 5); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(x0 + 5, y + 3, x1 - x0 - 10, 2);
    ctx.fillStyle = 'rgba(43,29,82,.35)';
    for (let k = x0 + 40; k < x1 - 10; k += 48) ctx.fillRect(k, y + 3, 2, 9);
  }
}

function drawLadder(l) {
  const t = ladderTop(l.g), b = ladderBot(l.g);
  // 가로대
  for (let y = t + 14; y < b; y += 14) {
    ctx.fillStyle = INK; ctx.fillRect(l.x - 11, y - 3, 22, 6);
    ctx.fillStyle = '#ffd9a0'; ctx.fillRect(l.x - 9, y - 1.5, 18, 3);
  }
  // 기둥
  for (const dx of [-11, 11]) {
    ctx.fillStyle = INK; roundRect(l.x + dx - 4, t, 8, b - t, 4); ctx.fill();
    ctx.fillStyle = '#ffd9a0'; roundRect(l.x + dx - 2, t + 2, 4, b - t - 4, 2); ctx.fill();
  }
}

function draw() {
  const now = performance.now() / 1000;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#4f8cff'); sky.addColorStop(1, '#8a4fe0');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 6);
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  for (let x = -H; x < H; x += 56) ctx.fillRect(x, -H, 26, H * 2);
  ctx.restore();
  for (let k = 0; k < 3; k++) cloud(((k * 190 + now * (5 + k * 3)) % (W + 160)) - 80, 118 + k * 18, 22 + k * 3);

  drawHud();
  if (!ladders) return;

  for (let f = 0; f < FLOORS; f++) drawFloor(f);
  ladders.forEach(drawLadder);

  const food = FOODS[(stage - 1) % FOODS.length];
  foods.forEach((fd) => { if (!fd.eaten) sprite(food, fd.x, floorY(fd.f) - 17 + Math.sin(now * 4 + fd.x) * 1.5, 26); });
  pots.forEach((q) => sprite(q.used ? '🏺' : '❓', q.x, floorY(q.f) - 17, 26));
  tacks.forEach((t) => sprite('📌', t.x, floorY(t.f) - 13, 22));
  bugs.forEach((b) => {
    ctx.save(); ctx.translate(b.x, floorY(b.f) - 16); ctx.scale(b.dir, 1);
    sprite('🐛', 0, 0, 26); ctx.restore();
  });
  if (snake) sprite('🐍', snake.x, snake.y - 17, 28);

  // 너구리: 깜빡일 때(무적)는 흐리게, 점프하면 그림자가 작아진다
  ctx.save();
  ctx.globalAlpha = invuln > 0 && Math.floor(invuln * 8) % 2 ? 0.35 : 1;
  ctx.fillStyle = 'rgba(43,29,82,.35)';
  const sh = Math.max(0.4, 1 - p.jy / 50);
  ctx.beginPath(); ctx.ellipse(p.x, p.y - 2, 18 * sh, 5 * sh, 0, 0, Math.PI * 2); ctx.fill();
  // 회색 너구리가 보라 배경에 묻히지 않게: 노란 빛 고리 + 테두리 두른 흰 동그라미 위에 그린다
  ctx.translate(p.x, p.y - 21 - p.jy);
  const glow = 25 + Math.sin(now * 6) * 2;
  ctx.fillStyle = 'rgba(255,210,63,.6)';
  ctx.beginPath(); ctx.arc(0, 0, glow, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(0, 3, 20, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  // 머리 위에 통통 튀는 노란 화살표
  const by = -38 + Math.sin(now * 5) * 3;
  ctx.beginPath(); ctx.moveTo(-8, by - 6); ctx.lineTo(8, by - 6); ctx.lineTo(0, by + 4); ctx.closePath();
  ctx.fillStyle = '#ffd23f'; ctx.fill();
  ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
  ctx.scale(-p.face, 1);
  sprite('🦝', 0, 1, 30, false);
  ctx.restore();

  if (msgTimer > 0) {
    const s = 1 + Math.max(0, msgTimer - 0.6) * 1.5;
    ctx.save(); ctx.translate(W / 2, 150); ctx.scale(s, s);
    label(flash, 0, 0, 38, flash.startsWith('-') || flash === '💥' ? '#ff5fa2' : '#fff54f');
    ctx.restore();
  }
}

let last = 0;
function loop(ts) {
  const dt = Math.min((ts - last) / 1000, 0.05); last = ts;
  if (state === 'playing') { update(dt); saveBest(); }
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame((t) => { last = t; loop(t); });

startBtn.addEventListener('click', () => start(true));
addEventListener('keydown', (e) => {
  if (e.key.startsWith('Arrow')) { keys[e.key] = true; e.preventDefault(); }
  if (e.key === ' ') { e.preventDefault(); if (state === 'playing') jumpReq = true; }
  if ((e.key === 'Enter' || e.key === ' ') && state !== 'playing') start(true);
});
addEventListener('keyup', (e) => { keys[e.key] = false; });
[['up', 'ArrowUp'], ['down', 'ArrowDown'], ['left', 'ArrowLeft'], ['right', 'ArrowRight']].forEach(([id, k]) => {
  const el = document.getElementById(id);
  const on = (e) => { e.preventDefault(); keys[k] = true; };
  const off = (e) => { e.preventDefault(); keys[k] = false; };
  el.addEventListener('pointerdown', on);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, off));
});

addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('selectstart', (e) => e.preventDefault());
document.getElementById('jump').addEventListener('pointerdown', (e) => { e.preventDefault(); jumpReq = true; });
