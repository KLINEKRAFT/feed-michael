(() => {
  // ====== ASSET PATHS ======
  const ASSETS = {
    title: "assets/title.png",
    background: "assets/background.png",
    idle: "assets/michael_idle.png",
    open: "assets/michael_open.png",
    burger: "assets/burger.png",
    feedBtn: "assets/feed_button.png",
    digits: "assets/digits.jpg", // NOTE: JPEG w/ magenta background
  };

  // ====== CANVAS INTERNAL RESOLUTION ======
  const W = 360;
  const H = 640;

  // ====== MICHAEL SCALING ======
  // Prevents the face from ever filling the screen, even with 1024x1024 sprites.
  const MICHAEL_MAX_W = 0.75; // max 75% of canvas width
  const MICHAEL_MAX_H = 0.45; // max 45% of canvas height
  const MICHAEL_POS = { x: W / 2, y: 300 };

  // ====== BURGER FLIGHT ======
  const BURGER = {
    startX: W / 2,
    startY: 520,
    endX: W / 2,
    endY: 320,       // tweak 300–340 to land perfectly in mouth
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

  // ====== DOM ======
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  const scoreCanvas = document.getElementById("score");
  const scoreCtx = scoreCanvas.getContext("2d", { alpha: true });

  const feedBtn = document.getElementById("feedBtn");
  const hint = document.getElementById("hint");
  const music = document.getElementById("bgMusic");

  // Set internal canvas resolution
  canvas.width = W;
  canvas.height = H;

  // Pixel-perfect rendering
  ctx.imageSmoothingEnabled = false;
  scoreCtx.imageSmoothingEnabled = false;

  // ====== STATE ======
  const GameState = { TITLE: "TITLE", PLAY: "PLAY" };
  let state = GameState.TITLE;

  let score = 0;
  let mouthOpenUntil = 0;

  let burgerActive = false;
  let burgerStartTs = 0;

  let chewUntil = 0;

  const popups = []; // {x,y,startTs,amount}
  const img = {};

  // Digits: we will preprocess the magenta background into transparency once.
  // We'll render from this offscreen canvas.
  let digitsKeyedCanvas = null;

  function now() { return performance.now(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

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

  // ============================================================
  // Magenta keying for digits.jpg
  // ============================================================
  function keyOutMagentaToCanvas(sourceImg) {
    const c = document.createElement("canvas");
    c.width = sourceImg.width;
    c.height = sourceImg.height;
    const cctx = c.getContext("2d", { willReadFrequently: true });

    cctx.imageSmoothingEnabled = false;
    cctx.drawImage(sourceImg, 0, 0);

    const imgData = cctx.getImageData(0, 0, c.width, c.height);
    const data = imgData.data;

    // JPEG will have compression noise, so use a tolerance.
    // Target magenta: (255, 0, 255)
    const tol = 70;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i + 0];
      const g = data[i + 1];
      const b = data[i + 2];

      const isMagenta =
        Math.abs(r - 255) <= tol &&
        g <= tol && // green near 0
        Math.abs(b - 255) <= tol;

      if (isMagenta) {
        data[i + 3] = 0; // alpha to 0
      }
    }

    cctx.putImageData(imgData, 0, 0);
    return c;
  }

  // ============================================================
  // Score rendering (expects digits in ONE ROW 0–9)
  // ============================================================
  function drawScore(n) {
    const dsrc = digitsKeyedCanvas;
    if (!dsrc) return;

    scoreCtx.clearRect(0, 0, scoreCanvas.width, scoreCanvas.height);

    const text = String(n);

    const digitW = Math.floor(dsrc.width / 10);
    const digitH = dsrc.height;

    // Scale up a bit for readability in the HUD
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
        dsrc,
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

  function playBlip() {
    ensureAudio();
    if (!audioCtx || !masterGain) return;

    const t = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.06);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

    osc.connect(g);
    g.connect(masterGain);

    osc.start(t);
    osc.stop(t + 0.10);
  }

  function playChomp() {
    ensureAudio();
    if (!audioCtx || !masterGain) return;

    const t = audioCtx.currentTime;

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
    filter.frequency.setValueAtTime(1200, t);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    noise.connect(filter);
    filter.connect(g);
    g.connect(masterGain);

    noise.start(t);
    noise.stop(t + duration);

    const osc = audioCtx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.09);

    const g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);

    osc.connect(g2);
    g2.connect(masterGain);

    osc.start(t);
    osc.stop(t + 0.11);
  }

  // ============================================================
  // GAME ACTIONS
  // ============================================================
  function startGame() {
    state = GameState.PLAY;
    hint.textContent = "Tap FEED to score.";

    score = 0;
    drawScore(score);

    burgerActive = false;
    chewUntil = 0;
    popups.length = 0;

    // iOS requirement: init audio from a gesture
    ensureAudio();

    // start background music
    if (music) {
      music.volume = 0.35;
      music.play().catch(() => {});
    }
  }

  function addPopup(amount) {
    popups.push({
      x: W / 2,
      y: BURGER.endY - 18,
      startTs: now(),
      amount,
    });
  }

  function doFeed() {
    if (state !== GameState.PLAY) return;

    playBlip();

    mouthOpenUntil = now() + MOUTH_OPEN_MS;

    burgerActive = true;
    burgerStartTs = now();

    score += 1;
    drawScore(score);

    addPopup(1);
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
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    if (img.title) drawCover(img.title);

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, H - 56, W, 56);

    ctx.fillStyle = "#fff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Tap screen or press FEED to start", W / 2, H - 24);
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
      ctx.font = "24px system-ui, sans-serif";
      ctx.textAlign = "center";

      const text = `+${p.amount}`;
      ctx.strokeText(text, p.x, y);
      ctx.fillText(text, p.x, y);

      ctx.restore();

      if (t >= 1) popups.splice(i, 1);
    }
  }

  function renderPlay(ts) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

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
        playChomp();
      }
    }

    renderPopups(ts);
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

    const entries = Object.entries(ASSETS);
    for (const [key, src] of entries) {
      img[key] = await loadImage(src);
    }

    // Convert digits.jpg magenta background to transparency once
    digitsKeyedCanvas = keyOutMagentaToCanvas(img.digits);

    skinFeedButton();
    drawScore(score);

    hint.textContent = "Tap the screen to start.";
    requestAnimationFrame(loop);
  }

  boot().catch((err) => {
    console.error(err);
    hint.textContent = "Error loading assets. Check /assets filenames (case-sensitive).";
  });
})();
