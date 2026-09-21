// 너구리 (1982 Sigma "Ponpoko"류 오마주 미니게임)
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 480, H = 640;
canvas.width = W; canvas.height = H;

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const titleEl = document.getElementById('title');
const msgEl = document.getElementById('msg');

const FOODS = ['🥕','🍒','🍄','🍊','🌽','🍍','🍉','🍆','🍈','🌰','🍌','🍓','🍑','🥔','🍎','🍇','🥜','🍐','🫘','🍺'];
const FLOORS = 5, COLS = 12, CW = W / COLS;
const floorY = (f) => 190 + f * 95;
const ladderTop = (g) => floorY(g), ladderBot = (g) => floorY(g + 1);

let state = 'ready', stage = 1, score = 0, lives = 3, timeLeft = 0;
let invuln = 0, p, ladders, foods, pots, tacks, bugs, snake, msgTimer = 0, flash = '';
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
  const occupied = {};
  const freeCol = (f) => {
    for (let t = 0; t < 50; t++) {
      const c = Math.floor(r() * COLS);
      const x = c * CW + CW / 2;
      const key = f + ':' + c;
      const onLadder = ladders.some((l) => (l.g === f || l.g === f - 1) && Math.abs(l.x - x) < CW);
      if (!occupied[key] && !onLadder) { occupied[key] = 1; return x; }
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
    if (f === FLOORS - 1 && Math.abs(bx - W / 2) < 90) bx = bx < W / 2 ? 40 : W - 40;
    bugs.push({ f, x: bx, dir: r() < 0.5 ? -1 : 1, sp: 30 + Math.min(stage, 30) });
  }
  snake = null;
  p = { x: W / 2, y: floorY(FLOORS - 1), f: FLOORS - 1, ladder: null, face: 1 };
  timeLeft = Math.max(60, 100 - stage);
  invuln = 2;
}

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
  p.x = W / 2; p.y = floorY(FLOORS - 1); p.f = FLOORS - 1; p.ladder = null;
  snake = null;
  invuln = 2;
}

function end(win) {
  state = 'over';
  titleEl.textContent = '게임 오버';
  msgEl.innerHTML = `스테이지 ${stage} · 점수 ${score}`;
  startBtn.textContent = '다시 하기';
  overlay.classList.remove('hidden');
}

function update(dt) {
  timeLeft -= dt;
  if (timeLeft <= 0) { loseLife(); timeLeft = Math.max(60, 100 - stage); return; }
  if (msgTimer > 0) msgTimer -= dt;
  if (invuln > 0) invuln -= dt;

  const SP = 150, CL = 120;
  const left = keys.ArrowLeft, right = keys.ArrowRight, up = keys.ArrowUp, down = keys.ArrowDown;
  if (p.ladder) {
    const l = p.ladder;
    if (up) p.y -= CL * dt; else if (down) p.y += CL * dt;
    if (p.y <= ladderTop(l.g)) { p.y = ladderTop(l.g); p.f = l.g; p.ladder = null; }
    else if (p.y >= ladderBot(l.g)) { p.y = ladderBot(l.g); p.f = l.g + 1; p.ladder = null; }
  } else {
    if (up || down) {
      const l = ladderAt(p.x, p.y, !!up);
      const okUp = up && l && l.g === p.f - 1, okDown = down && l && l.g === p.f;
      if (okUp || okDown) { p.ladder = l; p.x = l.x; }
    }
    if (!p.ladder) {
      if (left) { p.x -= SP * dt; p.face = -1; }
      if (right) { p.x += SP * dt; p.face = 1; }
      p.x = Math.max(16, Math.min(W - 16, p.x));
    }
  }

  // 음식
  if (!p.ladder) foods.forEach((fd) => {
    if (!fd.eaten && fd.f === p.f && Math.abs(fd.x - p.x) < 20) { fd.eaten = true; score += 100; }
  });
  // 항아리
  if (!p.ladder) pots.forEach((q) => {
    if (!q.used && q.f === p.f && Math.abs(q.x - p.x) < 20) {
      q.used = true;
      if (Math.random() < 0.7) { score += 500; flash = '+500'; msgTimer = 0.8; }
      else snake = { f: q.f, x: q.x, y: floorY(q.f), ladder: null, life: 6, sp: 45 + stage };
    }
  });
  // 압정
  if (!p.ladder && tacks.some((t) => t.f === p.f && Math.abs(t.x - p.x) < 14)) { loseLife(); return; }
  // 지네
  bugs.forEach((b) => {
    b.x += b.dir * b.sp * dt;
    if (b.x < 16) { b.x = 16; b.dir = 1; }
    if (b.x > W - 16) { b.x = W - 16; b.dir = -1; }
  });
  if (!p.ladder && bugs.some((b) => b.f === p.f && Math.abs(b.x - p.x) < 16)) { loseLife(); return; }

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
      if (Math.abs(s.x - p.x) < 16 && Math.abs(s.y - p.y) < 24) { loseLife(); return; }
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

function draw() {
  ctx.fillStyle = '#101830'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(`SCORE ${score}`, 12, 20);
  ctx.textAlign = 'center';
  ctx.fillText(`STAGE ${stage} ${FOODS[(stage - 1) % FOODS.length]}`, W / 2, 20);
  ctx.textAlign = 'right';
  ctx.fillText('🦝'.repeat(Math.max(lives, 0)), W - 12, 20);
  ctx.fillStyle = timeLeft < 10 ? '#ff5050' : '#ffd23f';
  ctx.fillRect(12, 40, (W - 24) * Math.max(timeLeft, 0) / Math.max(60, 100 - stage), 8);

  if (!ladders) return;
  ctx.textAlign = 'center';
  // 바닥
  ctx.fillStyle = '#8b5a2b';
  for (let f = 0; f < FLOORS; f++) ctx.fillRect(0, floorY(f), W, 6);
  // 사다리
  ctx.strokeStyle = '#d9b26f'; ctx.lineWidth = 3;
  ladders.forEach((l) => {
    const t = ladderTop(l.g), b = ladderBot(l.g);
    ctx.beginPath(); ctx.moveTo(l.x - 9, t); ctx.lineTo(l.x - 9, b); ctx.moveTo(l.x + 9, t); ctx.lineTo(l.x + 9, b); ctx.stroke();
    for (let y = t + 10; y < b; y += 14) { ctx.beginPath(); ctx.moveTo(l.x - 9, y); ctx.lineTo(l.x + 9, y); ctx.stroke(); }
  });
  ctx.font = '26px serif';
  const food = FOODS[(stage - 1) % FOODS.length];
  foods.forEach((fd) => { if (!fd.eaten) ctx.fillText(food, fd.x, floorY(fd.f) - 16); });
  pots.forEach((q) => ctx.fillText(q.used ? '🏺' : '❓', q.x, floorY(q.f) - 16));
  tacks.forEach((t) => ctx.fillText('📌', t.x, floorY(t.f) - 12));
  bugs.forEach((b) => { ctx.save(); ctx.translate(b.x, floorY(b.f) - 16); ctx.scale(b.dir, 1); ctx.fillText('🐛', 0, 0); ctx.restore(); });
  if (snake) ctx.fillText('🐍', snake.x, snake.y - 16);
  ctx.save(); ctx.globalAlpha = invuln > 0 && Math.floor(invuln * 8) % 2 ? 0.35 : 1; ctx.translate(p.x, p.y - 18); ctx.scale(-p.face, 1); ctx.font = '30px serif'; ctx.fillText('🦝', 0, 0); ctx.restore();

  if (msgTimer > 0) {
    ctx.font = 'bold 32px monospace'; ctx.fillStyle = '#fff'; ctx.fillText(flash, W / 2, 110);
  }
}

let last = 0;
function loop(ts) {
  const dt = Math.min((ts - last) / 1000, 0.05); last = ts;
  if (state === 'playing') update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame((t) => { last = t; loop(t); });

startBtn.addEventListener('click', () => start(true));
addEventListener('keydown', (e) => {
  if (e.key.startsWith('Arrow')) { keys[e.key] = true; e.preventDefault(); }
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
