// Virtual world size for consistent scaling
const VIRTUAL_W = 800;
const VIRTUAL_H = 450;

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreCanvas = document.getElementById("scoreCanvas");
const scoreCtx = scoreCanvas.getContext("2d");

const feedButton = document.getElementById("feedButton");
const startButton = document.getElementById("startButton");
const startScreen = document.getElementById("startScreen");

const music = document.getElementById("bgMusic");

let score = 0;
let highScore = parseInt(localStorage.getItem("feedMichaelHigh")) || 0;

let combo = 1;
let lastFeed = 0;

let shake = 0;

let burgerX = -200;
let burgerY = 0;
let burgerFlying = false;

let mouthOpen = false;

let scale = 1;
let offsetX = 0;
let offsetY = 0;

const img = {};

const ASSETS = {
  background: "assets/background.png",
  burger: "assets/burger.png",
  idle: "assets/michael_idle.png",
  open: "assets/michael_open.png",
  digits: "assets/digits.png"
};

function loadImage(src) {
  return new Promise((resolve) => {
    const i = new Image();
    i.src = src;
    i.onload = () => resolve(i);
  });
}

async function loadAssets() {
  for (const key in ASSETS) {
    img[key] = await loadImage(ASSETS[key]);
  }
  draw(); // initial draw after assets load
}

startButton.onclick = () => {
  startScreen.style.display = "none";

  // resume or start music
  if (music.paused) {
    music.volume = 0.4;
    music.play();
  }

  loadAssets();
};

feedButton.addEventListener("click", feed);
feedButton.addEventListener("touchstart", (e) => {
  e.preventDefault();
  feed();
}, { passive: false });

function feed() {
  const now = Date.now();

  if (now - lastFeed < 1000) combo++;
  else combo = 1;

  lastFeed = now;

  score += combo;

  if (score > highScore) {
    highScore = score;
    localStorage.setItem("feedMichaelHigh", highScore);
  }

  burgerX = canvas.width * 1.0;
  burgerY = canvas.height * 0.55;
  burgerFlying = true;

  mouthOpen = true;
  shake = 10;

  setTimeout(() => {
    mouthOpen = false;
  }, 200);
}

function drawScore() {
  scoreCtx.clearRect(0, 0, scoreCanvas.width, scoreCanvas.height);

  const s = score.toString();
  const digitWidth = img.digits.width / 10;
  for (let i = 0; i < s.length; i++) {
    const n = parseInt(s[i], 10);
    scoreCtx.drawImage(
      img.digits,
      n * digitWidth,
      0,
      digitWidth,
      img.digits.height,
      i * 40,
      0,
      40,
      80
    );
  }
}

function updateBurger() {
  if (!burgerFlying) return;

  burgerX -= 30;
  if (burgerX < canvas.width * 0.55) {
    burgerFlying = false;
  }
}

function resizeCanvas() {
  // Fit the canvas into the available space while preserving aspect
  const holder = document.getElementById("canvasHolder");
  const w = holder.clientWidth;
  const h = holder.clientHeight;

  // Compute scale to fit virtual resolution into actual space
  const scaleX = w / VIRTUAL_W;
  const scaleY = h / VIRTUAL_H;
  scale = Math.min(scaleX, scaleY);
  // Center the render area
  offsetX = Math.floor((w - VIRTUAL_W * scale) / 2);
  offsetY = Math.floor((h - VIRTUAL_H * scale) / 2);

  // Set the actual canvas size to virtual resolution times pixel ratio
  canvas.width = Math.floor(VIRTUAL_W);
  canvas.height = Math.floor(VIRTUAL_H);

  // Also prepare score canvas to scale with UI
  scoreCanvas.style.width = "200px";
  scoreCanvas.style.height = "50px";

  // Redraw on resize
  draw();
}

function draw() {
  // Use a persistent raf loop
  // We rely on requestAnimationFrame loop in the function below
}

let rafId = null;
function loop() {
  rafId = requestAnimationFrame(loop);

  // Clear to black
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Sub-pixel jitter for shake
  let oX = 0, oY = 0;
  if (shake > 0) {
    oX = (Math.random() - 0.5) * shake;
    oY = (Math.random() - 0.5) * shake;
    shake -= 0.5;
  }

  // Background
  ctx.drawImage(img.background, oX, oY, canvas.width, canvas.height);

  // Choose face
  const face = mouthOpen ? img.open : img.idle;
  ctx.drawImage(face, oX, oY, canvas.width, canvas.height);

  // Burger
  updateBurger();
  if (burgerFlying) {
    ctx.drawImage(img.burger, burgerX, burgerY, 120, 120);
  }

  // Score
  drawScore();
}

// Responsive start: listen to resize
window.addEventListener("resize", () => {
  resizeCanvas();
});

// Kickoff: ensure canvas is sized after DOM ready
function boot() {
  resizeCanvas();
  loop();
}

document.addEventListener("DOMContentLoaded", boot);
