// ---------- Setup ----------
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const GRID_SIZE = 30;
const CELL = canvas.width / GRID_SIZE;

const scoreDisplay = document.getElementById('score');
const levelDisplay = document.getElementById('level');
const bestDisplay = document.getElementById('best');
const modeDisplay = document.getElementById('mode');
const effectDisplay = document.getElementById('effect');
const muteBtn = document.getElementById('muteBtn');

// ---------- Difficulty ----------
const DIFFICULTY = {
  easy:   { label: 'Easy',   baseTick: 170, rockLevel: 4, rocksPerLevel: 1 },
  medium: { label: 'Medium', baseTick: 140, rockLevel: 3, rocksPerLevel: 1 },
  hard:   { label: 'Hard',   baseTick: 110, rockLevel: 2, rocksPerLevel: 2 },
};
let difficulty = DIFFICULTY.medium;

// ---------- Game state ----------
let gameState = 'menu';   // menu, ready, playing, over
let gameOverMessage = '';

let score = 0;
let level = 1;
let best = Number(localStorage.getItem('snakeBest')) || 0;
bestDisplay.textContent = best;

let snake = [
  { x: 15, y: 15 },
    { x: 14, y: 15 },
    { x: 13, y: 15 },
    { x: 12, y: 15 },
    { x: 11, y: 15 },
    { x: 10, y: 15 },
];
let prevSnake = [];
let direction = { x: 1, y: 0 };
let nextDir = { x: 1, y: 0 };
let food = { x: 20, y: 15 };
let rocks = [];
let particles = [];
let powerup = null;
let pulseTime = 0;
const effects = { boost: 0, double: 0 };

const POWER = {
  boost:  { color: '#C58FE0', label: 'B'  },
  double: { color: '#6FB7D9', label: '2x' },
  shrink: { color: '#C0596B', label: 'S'  },
};

// ---------- Sound ----------
let audioCtx = null;
let muted = false;

function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (err) {}
}

function beep(freq, dur, type = 'sine', vol = 0.07, slideTo = null) {
  if (muted) return;
  try {
    unlockAudio();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch (err) {}
}

const sounds = {
  eat:   () => beep(520, 0.12, 'square', 0.05, 880),
  power: () => { beep(660, 0.1, 'triangle'); setTimeout(() => beep(990, 0.15, 'triangle'), 90); },
  level: () => { beep(440, 0.1, 'square', 0.05); setTimeout(() => beep(660, 0.1, 'square', 0.05), 100); setTimeout(() => beep(880, 0.2, 'square', 0.05), 200); },
  over:  () => beep(300, 0.7, 'sawtooth', 0.08, 50),
};

function toggleMute() {
  muted = !muted;
  muteBtn.textContent = muted ? 'Sound: Off' : 'Sound: On';
}

// ---------- Helpers ----------
function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function copySnake() {
  return snake.map(s => ({ x: s.x, y: s.y }));
}

function isOccupied(x, y) {
  if (snake.some(s => s.x === x && s.y === y)) return true;
  if (rocks.some(r => r.x === x && r.y === y)) return true;
  if (food.x === x && food.y === y) return true;
  if (powerup && powerup.x === x && powerup.y === y) return true;
  return false;
}

function randomFreeCell() {
  let x, y;
  do {
    x = Math.floor(Math.random() * GRID_SIZE);
    y = Math.floor(Math.random() * GRID_SIZE);
  } while (isOccupied(x, y));
  return { x, y };
}

function placeFood() {
  food = randomFreeCell();
}

function spawnRock() {
  rocks.push(randomFreeCell());
}

function spawnPowerup() {
  const types = ['boost', 'double', 'shrink'];
  const cell = randomFreeCell();
  powerup = {
    x: cell.x,
    y: cell.y,
    type: types[Math.floor(Math.random() * types.length)],
    expires: performance.now() + 9000,
  };
}

function spawnParticles(gridX, gridY, color) {
  const cx = gridX * CELL + CELL / 2;
  const cy = gridY * CELL + CELL / 2;
  for (let i = 0; i < 16; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    particles.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color });
  }
}

function isActive(name, now) {
  return now < effects[name];
}

function currentTick(now) {
  let t = Math.max(55, difficulty.baseTick - (level - 1) * 12);
  if (isActive('boost', now)) t *= 0.65;
  return t;
}

// ---------- Game flow ----------
function resetGame() {
  snake = [
    { x: 15, y: 15 },
    { x: 14, y: 15 },
    { x: 13, y: 15 },
  ];
  prevSnake = copySnake();
  direction = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  score = 0;
  level = 1;
  rocks = [];
  particles = [];
  powerup = null;
  effects.boost = 0;
  effects.double = 0;
  acc = 0;
  scoreDisplay.textContent = score;
  levelDisplay.textContent = level;
  placeFood();
  gameState = 'ready';
}

function gameOver(message) {
  gameState = 'over';
  gameOverMessage = message;
  if (score > best) {
    best = score;
    localStorage.setItem('snakeBest', best);
    bestDisplay.textContent = best;
  }
  sounds.over();
}

function step() {
  const now = performance.now();
  prevSnake = copySnake();
  direction = nextDir;

  const head = snake[0];
  const newHead = { x: head.x + direction.x, y: head.y + direction.y };

  if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
    return gameOver('You hit a wall.');
  }
  if (snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
    return gameOver('You ran into yourself.');
  }
  if (rocks.some(r => r.x === newHead.x && r.y === newHead.y)) {
    return gameOver('You hit a rock.');
  }

  snake.unshift(newHead);

  if (newHead.x === food.x && newHead.y === food.y) {
    const multiplier = (isActive('double', now) || isActive('boost', now)) ? 2 : 1;
    score += 10 * multiplier;
    scoreDisplay.textContent = score;
    spawnParticles(food.x, food.y, '#F2C14E');
    sounds.eat();
    placeFood();

    if (!powerup && Math.random() < 0.3) spawnPowerup();

    const newLevel = Math.floor(score / 50) + 1;
    if (newLevel > level) {
      level = newLevel;
      levelDisplay.textContent = level;
      sounds.level();
      if (level >= difficulty.rockLevel) {
        for (let i = 0; i < difficulty.rocksPerLevel; i++) spawnRock();
      }
    }
  } else {
    snake.pop();
  }

  if (powerup && newHead.x === powerup.x && newHead.y === powerup.y) {
    if (powerup.type === 'boost') effects.boost = now + 5000;
    if (powerup.type === 'double') effects.double = now + 8000;
    if (powerup.type === 'shrink') {
      for (let i = 0; i < 3 && snake.length > 3; i++) snake.pop();
    }
    spawnParticles(powerup.x, powerup.y, POWER[powerup.type].color);
    sounds.power();
    powerup = null;
  }
}

// ---------- Input (keyboard + swipe + on-screen buttons) ----------
const DIRS = {
  up:    { x: 0,  y: -1 },
  down:  { x: 0,  y: 1 },
  left:  { x: -1, y: 0 },
  right: { x: 1,  y: 0 },
};

function setDirection(d) {
  if (gameState === 'menu' || gameState === 'over') return;
  if (d.x === -direction.x && d.y === -direction.y) return;   // ulta nahi mud sakte
  nextDir = d;
  if (gameState === 'ready') gameState = 'playing';
}

// Keyboard (laptop)
window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    toggleMute();
    return;
  }
  const map = {
    ArrowUp: DIRS.up, ArrowDown: DIRS.down, ArrowLeft: DIRS.left, ArrowRight: DIRS.right,
    w: DIRS.up, W: DIRS.up, s: DIRS.down, S: DIRS.down,
    a: DIRS.left, A: DIRS.left, d: DIRS.right, D: DIRS.right,
  };
  const dir = map[e.key];
  if (!dir) return;
  e.preventDefault();
  unlockAudio();
  setDirection(dir);
});

// Swipe (phone)
let touchX = 0;
let touchY = 0;

canvas.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  touchX = t.clientX;
  touchY = t.clientY;
  unlockAudio();
  if (gameState === 'over') resetGame();   // game over par tap karo to dobara shuru
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  const dx = t.clientX - touchX;
  const dy = t.clientY - touchY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;

  if (Math.abs(dx) > Math.abs(dy)) {
    setDirection(dx > 0 ? DIRS.right : DIRS.left);
  } else {
    setDirection(dy > 0 ? DIRS.down : DIRS.up);
  }
  touchX = t.clientX;
  touchY = t.clientY;
}, { passive: false });

// On-screen arrow buttons (phone)
document.querySelectorAll('[data-dir]').forEach(btn => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    unlockAudio();
    setDirection(DIRS[btn.dataset.dir]);
  });
});

// Difficulty, restart, mute buttons
document.querySelectorAll('[data-d]').forEach(btn => {
  btn.addEventListener('click', () => {
    unlockAudio();
    difficulty = DIFFICULTY[btn.dataset.d];
    modeDisplay.textContent = difficulty.label;
    resetGame();
    btn.blur();
  });
});

document.getElementById('restartBtn').addEventListener('click', (e) => {
  unlockAudio();
  resetGame();
  e.target.blur();
});

muteBtn.addEventListener('click', (e) => {
  toggleMute();
  e.target.blur();
});

// ---------- Drawing ----------
function drawFood() {
  const pulse = Math.sin(pulseTime) * 3;
  const x = food.x * CELL + CELL / 2;
  const y = food.y * CELL + CELL / 2;

  ctx.save();
  ctx.shadowColor = '#F2C14E';
  ctx.shadowBlur = 15;
  ctx.fillStyle = '#F2C14E';
  ctx.beginPath();
  ctx.arc(x, y, CELL / 2.5 + pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRocks() {
  const heat = 0.5 + 0.5 * Math.sin(pulseTime * 0.8);   // 0 se 1 ke beech upar-neeche

  rocks.forEach(r => {
    const x = r.x * CELL + 2;
    const y = r.y * CELL + 2;
    const s = CELL - 4;
    const cx = x + s / 2;
    const cy = y + s / 2;

    ctx.save();

    // bahar ka garam glow (pulse karta hai)
    ctx.shadowColor = '#ff4500';
    ctx.shadowBlur = 10 + heat * 14;

    // lava body
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, s * 0.75);
    g.addColorStop(0, '#ffd23f');
    g.addColorStop(0.45, '#ff6a00');
    g.addColorStop(1, '#8a1c05');
    ctx.fillStyle = g;
    roundRect(x, y, s, s, 5);
    ctx.fill();

    // kaali crust, beech me se lava chamakta dikhta hai
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(25, 8, 4, 0.82)';
    roundRect(x + 3, y + 3, s - 6, s - 6, 4);
    ctx.fill();

    // crust ki daraar, jisme se lava jhalakta hai
    ctx.strokeStyle = `rgba(255, ${120 + heat * 90}, 20, 0.95)`;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + s * 0.2, y + s * 0.3);
    ctx.lineTo(x + s * 0.45, y + s * 0.5);
    ctx.lineTo(x + s * 0.35, y + s * 0.75);
    ctx.moveTo(x + s * 0.45, y + s * 0.5);
    ctx.lineTo(x + s * 0.8, y + s * 0.4);
    ctx.stroke();

    ctx.restore();
  });
}
function drawBackground() {
  const g = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, 40,
    canvas.width / 2, canvas.height / 2, canvas.width * 0.75
  );
  g.addColorStop(0, '#101a3a');
  g.addColorStop(1, '#04060f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.28)';
  ctx.lineWidth = 1;
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  for (let i = 0; i <= GRID_SIZE; i++) {
    ctx.moveTo(i * CELL, 0);
    ctx.lineTo(i * CELL, canvas.height);
    ctx.moveTo(0, i * CELL);
    ctx.lineTo(canvas.width, i * CELL);
  }
  ctx.stroke();
  ctx.restore();
}
function drawPowerup(now) {
  if (!powerup) return;
  if (powerup.expires - now < 2500 && Math.floor(now / 200) % 2 === 0) return;

  const P = POWER[powerup.type];
  const cx = powerup.x * CELL + CELL / 2;
  const cy = powerup.y * CELL + CELL / 2;

  ctx.save();
  ctx.shadowColor = P.color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = P.color;
  ctx.beginPath();
  ctx.arc(cx, cy, CELL / 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#0D1410';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(P.label, cx, cy + 1);
  ctx.restore();
}

function segPos(i, a) {
  const seg = snake[i];
  const prev = prevSnake[Math.min(i, prevSnake.length - 1)] || seg;
  return {
    x: (prev.x + (seg.x - prev.x) * a) * CELL + CELL / 2,
    y: (prev.y + (seg.y - prev.y) * a) * CELL + CELL / 2,
  };
}

function drawSnake(a, now) {
  const pts = snake.map((_, i) => segPos(i, a));
  const n = pts.length;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // body: tail se head ki taraf, taaki head upar rahe
  for (let i = n - 1; i > 0; i--) {
    const t = i / (n - 1);
    const color = `hsl(${340 - t * 80}, 100%, ${58 - t * 12}%)`;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.lineWidth = CELL * (0.85 - 0.3 * t);
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i - 1].x, pts[i - 1].y);
    ctx.stroke();
  }

  // scales (halke chamakte nishaan)
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  for (let i = 1; i < n; i++) {
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, CELL * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }

  // head
  const h = pts[0];
  const d = direction;
  const p = { x: -d.y, y: d.x };

  // jeebh
  const flick = Math.sin(now / 130);
  if (flick > 0.2) {
    const len = CELL * 0.55 * flick;
    const bx = h.x + d.x * CELL * 0.55;
    const by = h.y + d.y * CELL * 0.55;
    const tx = bx + d.x * len;
    const ty = by + d.y * len;
    ctx.strokeStyle = '#ff2e4d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + d.x * 4 + p.x * 4, ty + d.y * 4 + p.y * 4);
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + d.x * 4 - p.x * 4, ty + d.y * 4 - p.y * 4);
    ctx.stroke();
  }

  ctx.shadowColor = '#ff3b6b';
  ctx.shadowBlur = 20;
  const hg = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, CELL * 0.6);
  hg.addColorStop(0, '#ff8aa8');
  hg.addColorStop(1, '#e0143c');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(h.x, h.y, CELL * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // aankhein
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#ffd23f';
  [-1, 1].forEach(side => {
    const ex = h.x + d.x * CELL * 0.15 + p.x * CELL * 0.27 * side;
    const ey = h.y + d.y * CELL * 0.15 + p.y * CELL * 0.27 * side;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(ex, ey, CELL * 0.17, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#12020a';
    ctx.beginPath();
    ctx.ellipse(ex, ey, CELL * 0.05, CELL * 0.13, Math.atan2(d.y, d.x), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 8;
  });

  ctx.restore();
}

function updateParticles(dt) {
  particles.forEach(p => {
    p.x += p.vx * dt / 16;
    p.y += p.vy * dt / 16;
    p.life -= dt / 450;
  });
  particles = particles.filter(p => p.life > 0);
}

function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawOverlay(title, subtitle) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#E9E4D8';
  ctx.textAlign = 'center';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 14);
  ctx.font = '26px sans-serif';
  ctx.fillText(subtitle, canvas.width / 2, canvas.height / 2 + 32);
  ctx.restore();
}

function updateEffectLabel(now) {
  const parts = [];
  if (isActive('boost', now)) parts.push('Boost ' + Math.ceil((effects.boost - now) / 1000) + 's');
  if (isActive('double', now)) parts.push('2x ' + Math.ceil((effects.double - now) / 1000) + 's');
  effectDisplay.textContent = parts.length ? parts.join(' + ') : 'none';
}

function render(a, now) {
  drawBackground();
  drawFood();
  drawRocks();
  drawPowerup(now);
  drawSnake(a, now);
  drawParticles();

  if (gameState === 'menu') {
    drawOverlay('Snake', 'Upar se Easy / Medium / Hard chuno');
  } else if (gameState === 'over') {
    drawOverlay('Game Over', gameOverMessage + '  Score: ' + score);
    ctx.save();
    ctx.fillStyle = '#E9E4D8';
    ctx.textAlign = 'center';
    ctx.font = '22px sans-serif';
    ctx.fillText('Tap ya Restart dabao', canvas.width / 2, canvas.height / 2 + 75);
    ctx.restore();
  } else if (gameState === 'ready') {
    ctx.save();
    ctx.fillStyle = '#E9E4D8';
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Swipe karo ya arrow key dabao', canvas.width / 2, canvas.height - 28);
    ctx.restore();
  }
}

// ---------- Main loop (60 fps) ----------
let lastTime = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(now - lastTime, 100);
  lastTime = now;

  pulseTime += dt * 0.009;
  updateParticles(dt);
  updateEffectLabel(now);

  if (powerup && now > powerup.expires) powerup = null;

  if (gameState === 'playing') {
    acc += dt;
    let tick = currentTick(now);
    while (acc >= tick && gameState === 'playing') {
      acc -= tick;
      step();
      tick = currentTick(now);
    }
    render(gameState === 'playing' ? acc / tick : 1, now);
  } else {
    render(1, now);
  }

  requestAnimationFrame(frame);
}

resetGame();
gameState = 'menu';
requestAnimationFrame(frame);