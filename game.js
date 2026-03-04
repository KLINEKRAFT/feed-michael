(() => {
  // ====== ASSET PATHS ======
  const ASSETS = {
    title: "assets/title.png",
    background: "assets/background.png",
    idle: "assets/michael_idle.png",
    open: "assets/michael_open.png",
    burger: "assets/burger.png",
    feedBtn: "assets/feed_button.png",
    digits: "assets/digits.png", // <-- now PNG
  };

  // ====== CANVAS INTERNAL RESOLUTION ======
  const W = 360;
  const H = 640;

  // ====== MICHAEL SCALING ======
  const MICHAEL_MAX_W = 0.75;
  const MICHAEL_MAX_H = 0.45;
  const MICHAEL_POS = { x: W / 2, y: 300 };

  // ====== BURGER FLIGHT ======
  const BURGER = {
    startX: W / 2,
    startY: 520,
    endX: W / 2,
    endY: 320,        // tweak 300–340 if burger misses mouth
    durationMs: 340,
    wobble: 12,
  };

  // ====== ANIMATION TIMINGS ======
  const MOUTH_OPEN_MS = 140;
  const CHEW_TOTAL_MS = 650;
  const CHEW_FRAME_MS = 85;

  // ====== SCORE POPUP ======
  const POPUP_LIFE_MS = 650;
  const POPUP_RISE = 42;

  // ====== COMBO SETTINGS ======
  const COMBO_WINDOW_MS = 650;   // must feed again within this time
  const COMBO_MAX = 3;           // 1x, 2x, 3x
  const BIG_BITE_SHAKE_AT = 3;   // shake when multiplier is 3x
  const SHAKE_MS = 160;

  // ====== HIGH SCORE ======
  const LS_KEY = "feedMichaelHighScore";

  // ====== DOM ======
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  const scoreCanvas = document.getElementById("score");
  const scoreCtx = scoreCanvas.getContext("2d", { alpha: true });

  const feedBtn = document.getElementById("feedBtn");
  const hint = document.getElementById("hint");
  const music = document.getElementById("bgMusic");

  canvas.width = W;
  canvas.height = H;

  ctx.imageSmoothingEnabled = false;
  scoreCtx.imageSmoothingEnabled = false;

  // ====== STATE ======
  const GameState = { TITLE: "TITLE", PLAY: "PLAY" };
  let state = GameState.TITLE;

  let score = 0;
  let highScore = loadHighScore();

  let mouthOpenUntil = 0;

  let burgerActive = false;
  let burgerStartTs = 0;

  let chewUntil = 0;

  // Combo tracking
  let lastFeedTs = 0;
  let combo = 1; // 1..3

  // Screen shake
  let shakeUntil = 0;
  let shakePower = 0;

  const popups = []; // {x,y,startTs,amount,text}

  const img = {};

  // ====== HELPERS ======
  function now() { return performance.now(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function loadHighScore() {
    try {
      const v = localStorage.getItem(LS_KEY);
      const n = v ? parseInt(v, 10) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  function saveHighScore(n) {
    try { localStorage.setItem(LS_KEY, String(n)); } catch {}
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = src;
    });
  }

  function drawCover(image) {
    const scale = Math.max(W / image.width, H / image.height);
    const dw = Math.floor(image.width * scale);
    const dh = Math.floor(image.height * scale);
    const dx = Math.floor((W - dw) / 2);
    const dy = Math.floor((H - dh) / 2);
    ctx.drawImage(image, dx, dy, dw, dh);
  }

  function computeMichaelScale() {
    const base = img.idle || img.open;
    if (!base) return 1;

    const maxW = W * MICHAEL_MAX_W;
    const maxH = H * MICHAEL_MAX_H;

    const sW = maxW / base.width;
    const sH = maxH / base.height;
    return Math.min(sW, sH);
  }

  function drawCenteredScaled(image, x, y, scale) {
    const dw = Math.floor(image.width * scale);
    const dh = Math.floor(image.height * scale);
    ctx.drawImage(image, Math.floor(x - dw / 2), Math.floor(y - dh / 2), dw, dh);
  }

  // ====== SCORE HUD (digits.png must be one row 0–9) ======
  function drawScoreHud(n) {
    const dimg = img.digits;
    if (!dimg) return;

    scoreCtx.clearRect(0, 0, scoreCanvas.width, scoreCanvas.height);

    const text = String(n);
    const digitW = Math.floor(dimg.width / 10);
    const digitH = dimg.height;

    const scale = 2;
    const totalW = text.length * digitW * scale;

    let x = Math.floor((scoreCanvas.width - totalW) / 2);
    const y = Math.floor((scoreCanvas.height - digitH * scale) / 2);

    scoreCtx.imageSmoothingEnabled = false;

    for (const ch of text) {
      const d = ch.charCodeAt(0) - 48;
      if (d < 0 || d > 9) continue;

      const sx = d * digitW;
      scoreCtx.drawImage(
        dimg,
        sx, 0, digitW, digitH,
        x, y, digitW * scale, digitH * scale
      );
      x += digitW * scale;
    }
  }

  function skinFeedButton() {
    if (!img.feedBtn) return;
    feedBtn.style.backgroundImage = `url(${ASSETS.feedBtn})`;
    feedBtn.style.backgroundSize = "contain";
    feedBtn.style.backgroundRepeat = "no-repeat";
    feedBtn.style.backgroundPosition = "center";
    feedBtn.style.color = "transparent";
  }

  // ============================================================
  // WebAudio SFX (NO FILE DOWNLOADS)
  // ============================================================
  let audioCtx = null;
  let masterGain = null;

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.35;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  function playBlip(mult = 1) {
    ensureAudio();
    if (!audioCtx || !masterGain) return;

    const t = audioCtx.currentTime;
    const base = 660 + (mult - 1) * 180;

    const osc = audioCtx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 1.6, t + 0.06);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

    osc.connect(g);
    g.connect(masterGain);

    osc.start(t);
    osc.stop(t + 0.10);
  }

  function playChomp(mult = 1) {
    ensureAudio();
    if (!audioCtx || !masterGain) return;

    const t = audioCtx.currentTime;

    // Noise burst
    const duration = 0.12;
    const bufferSize = Math.floor(audioCtx.sampleRate * duration);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = (Math.random() * 2 - 1);
      last = (last * 0.85) + (white * 0.15);
      data[i] = last;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1100 + (mult - 1) * 250, t);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    noise.connect(filter);
    filter.connect(g);
    g.connect(masterGain);

    noise.start(t);
    noise.stop(t + duration);

    // Low thunk
    const osc = audioCtx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(170 - (mult - 1) * 10, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.09);

    const g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.30 + (mult - 1) * 0.05, t + 0.01);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);

    osc.connect(g2);
    g2.connect(masterGain);

    osc.start(t);
    osc.stop(t + 0.11);
  }

  // ============================================================
  // GAME LOGIC
  // ============================================================
  function startGame() {
    state = GameState.PLAY;

    score = 0;
    combo = 1;
    lastFeedTs = 0;
    burgerActive = false;
    chewUntil = 0;
    popups.length = 0;
    shakeUntil = 0;
    shakePower = 0;

    drawScoreHud(score);

    hint.textContent = `High Score: ${highScore}`;

    // iOS requirement: init audio from a gesture
    ensureAudio();

    // start background music
    if (music) {
      music.volume = 0.35;
      music.play().catch(() => {});
    }
  }

  function addPopup(amount, mult) {
    const label = mult > 1 ? `+${amount}  (${mult}x)` : `+${amount}`;
    popups.push({
      x: W / 2,
      y: BURGER.endY - 18,
      startTs: now(),
      amount,
      text: label,
    });
  }

  function setShake(power) {
    shakePower = power;
    shakeUntil = now() + SHAKE_MS;
  }

  function updateCombo(ts) {
    if (!lastFeedTs) {
      combo = 1;
      return;
    }
    const dt = ts - lastFeedTs;
    if (dt <= COMBO_WINDOW_MS) {
      combo = clamp(combo + 1, 1, COMBO_MAX);
    } else {
      combo = 1;
    }
  }

  function doFeed() {
    if (state !== GameState.PLAY) return;

    const ts = now();

    // combo logic
    updateCombo(ts);
    lastFeedTs = ts;

    const mult = combo;          // 1..3
    const points = mult;         // 1x=1, 2x=2, 3x=3

    // SFX: higher pitch with combo
    playBlip(mult);

    // Visuals
    mouthOpenUntil = ts + MOUTH_OPEN_MS;
    burgerActive = true;
    burgerStartTs = ts;

    // Scoring
    score += points;
    drawScoreHud(score);
    addPopup(points, mult);

    // Big bite effects
    if (mult >= BIG_BITE_SHAKE_AT) {
      setShake(6);
    } else if (mult === 2) {
      setShake(3);
    }

    // High score saving
    if (score > highScore) {
      highScore = score;
      saveHighScore(highScore);
      hint.textContent = `New High Score: ${highScore}`;
    } else {
      hint.textContent = `High Score: ${highScore}`;
    }
  }

  // ============================================================
  // INPUT
  // ============================================================
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === GameState.TITLE) startGame();
  });

  feedBtn.addEventListener("click", () => {
    if (state === GameState.TITLE) startGame();
    else doFeed();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      if (state === GameState.TITLE) startGame();
      else doFeed();
    }
  });

  // ============================================================
  // RENDER
  // ============================================================
  function renderTitle() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    if (img.title) drawCover(img.title);

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, H - 64, W, 64);

    ctx.fillStyle = "#fff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Tap screen or press FEED to start", W / 2, H - 36);
    ctx.fillText(`High Score: ${highScore}`, W / 2, H - 16);
  }

  function renderPopups(ts) {
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      const age = ts - p.startTs;
      const t = clamp(age / POPUP_LIFE_MS, 0, 1);

      const y = p.y - (POPUP_RISE * t);
      const alpha = 1 - t;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      ctx.font = "22px system-ui, sans-serif";
      ctx.textAlign = "center";

      ctx.strokeText(p.text, p.x, y);
      ctx.fillText(p.text, p.x, y);

      ctx.restore();

      if (t >= 1) popups.splice(i, 1);
    }
  }

  function renderPlay(ts) {
    // Screen shake transform
    let ox = 0, oy = 0;
    if (ts < shakeUntil) {
      const p = (shakeUntil - ts) / SHAKE_MS; // 1..0
      const mag = shakePower * p;
      ox = (Math.random() * 2 - 1) * mag;
      oy = (Math.random() * 2 - 1) * mag;
    }
    ctx.setTransform(1, 0, 0, 1, ox, oy);

    ctx.fillStyle = "#000";
    ctx.fillRect(-ox, -oy, W, H);

    if (img.background) drawCover(img.background);

    const michaelScale = computeMichaelScale();

    let michaelFrame = img.idle;
    if (ts < chewUntil) {
      const phase = Math.floor(ts / CHEW_FRAME_MS) % 2;
      michaelFrame = phase === 0 ? img.open : img.idle;
    } else if (ts < mouthOpenUntil) {
      michaelFrame = img.open;
    } else {
      michaelFrame = img.idle;
    }

    if (michaelFrame) {
      drawCenteredScaled(michaelFrame, MICHAEL_POS.x, MICHAEL_POS.y, michaelScale);
    }

    // Burger flight
    if (burgerActive && img.burger) {
      const t0 = (ts - burgerStartTs) / BURGER.durationMs;
      const t = clamp(t0, 0, 1);

      const ease = 1 - Math.pow(1 - t, 3);

      const xWobble = Math.sin(t * Math.PI) * BURGER.wobble;
      const x = BURGER.startX + (BURGER.endX - BURGER.startX) * ease + xWobble;
      const y = BURGER.startY + (BURGER.endY - BURGER.startY) * ease;

      const burgerBaseScale = Math.min(1.0, michaelScale * 0.55);
      const shrink = 1 - (0.25 * t);
      const s = burgerBaseScale * shrink;

      const bw = Math.floor(img.burger.width * s);
      const bh = Math.floor(img.burger.height * s);

      ctx.drawImage(img.burger, Math.floor(x - bw / 2), Math.floor(y - bh / 2), bw, bh);

      if (t >= 1) {
        burgerActive = false;
        chewUntil = ts + CHEW_TOTAL_MS;
        playChomp(combo);
      }
    }

    renderPopups(ts);

    // Reset transform back to normal for safety
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function loop(ts) {
    ctx.imageSmoothingEnabled = false;

    if (state === GameState.TITLE) renderTitle();
    else renderPlay(ts);

    requestAnimationFrame(loop);
  }

  // ============================================================
  // BOOT
  // ============================================================
  async function boot() {
    hint.textContent = "Loading…";

    for (const [key, src] of Object.entries(ASSETS)) {
      img[key] = await loadImage(src);
    }

    skinFeedButton();
    drawScoreHud(score);

    hint.textContent = `High Score: ${highScore}`;
    requestAnimationFrame(loop);
  }

  boot().catch((err) => {
    console.error(err);
    hint.textContent = "Error loading assets. Check /assets filenames (case-sensitive).";
  });
})();
