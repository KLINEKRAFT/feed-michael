(() => {
  // ====== ASSET PATHS ======
  const ASSETS = {
    title: "assets/title.png",
    background: "assets/background.png",
    idle: "assets/michael_idle.png",
    open: "assets/michael_open.png",
    burger: "assets/burger.png",
    feedBtn: "assets/feed_button.png",
    digits: "assets/digits.png",
  };

  // ====== CANVAS INTERNAL RESOLUTION ======
  // Keep a stable internal resolution; CSS scales it to fit the phone.
  const W = 360;
  const H = 640;

  // ====== MICHAEL SCALING (prevents giant face filling screen) ======
  // With 1024x1024 sprites, keep him smaller on screen:
  const MICHAEL_MAX_W = 0.75; // max 75% of canvas width
  const MICHAEL_MAX_H = 0.45; // max 45% of canvas height
  const MICHAEL_POS = { x: W / 2, y: 300 };

  // ====== BURGER FLIGHT ======
  const BURGER = {
    startX: W / 2,
    startY: 520,
    endX: W / 2,
    endY: 320,       // mouth target (tweak 300–340 if needed)
    durationMs: 340,
    wobble: 12,
  };

  // ====== ANIMATION TIMINGS ======
  const MOUTH_OPEN_MS = 140;    // quick open immediately on press
  const CHEW_TOTAL_MS = 650;    // chew duration after burger lands
  const CHEW_FRAME_MS = 85;     // toggle open/idle to simulate chewing

  // ====== SCORE POPUP ======
  const POPUP_LIFE_MS = 650;
  const POPUP_RISE = 42;

  // ====== DOM ======
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  const scoreCanvas = document.getElementById("score");
  const scoreCtx = scoreCanvas.getContext("2d", { alpha: true });

  const htmlFeedBtn = document.getElementById("feedBtn");
  const hint = document.getElementById("hint");
  const music = document.getElementById("bgMusic"); // from index.html

  // Pixel-perfect rendering
  ctx.imageSmoothingEnabled = false;
  scoreCtx.imageSmoothingEnabled = false;

  // Set internal canvas resolution (critical)
  canvas.width = W;
  canvas.height = H;

  // ====== GAME STATE ======
  const GameState = { TITLE: "TITLE", PLAY: "PLAY" };
  let state = GameState.TITLE;

  let score = 0;

  // mouth open window
  let mouthOpenUntil = 0;

  // burger flight
  let burgerActive = false;
  let burgerStartTs = 0;

  // chew cycle
  let chewUntil = 0;

  // score popups: {x,y,startTs,amount}
  const popups = [];

  // images
  const img = {};

  // ====== HELPERS ======
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

  // Draw image to cover the full canvas while preserving aspect
  function drawCover(image) {
    const scale = Math.max(W / image.width, H / image.height);
    const dw = Math.floor(image.width * scale);
    const dh = Math.floor(image.height * scale);
    const dx = Math.floor((W - dw) / 2);
    const dy = Math.floor((H - dh) / 2);
    ctx.drawImage(image, dx, dy, dw, dh);
  }

  // Compute Michael scale so he always fits and never fills the screen
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

  // ====== SCORE HUD (digits.png assumed row 0-9) ======
  function drawScore(n) {
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

    for (const ch of text) {
      const d = ch.charCodeAt(0) - 48;
      const sx = d * digitW;
      scoreCtx.drawImage(
        dimg,
        sx, 0, digitW, digitH,
        x, y, digitW * scale, digitH * scale
      );
      x += digitW * scale;
    }
  }

  // Make the FEED button use your pixel-art button image
  function skinFeedButton() {
    if (!img.feedBtn) return;
    htmlFeedBtn.style.backgroundImage = `url(${ASSETS.feedBtn})`;
    htmlFeedBtn.style.backgroundSize = "contain";
    htmlFeedBtn.style.backgroundRepeat = "no-repeat";
    htmlFeedBtn.style.backgroundPosition = "center";
    htmlFeedBtn.style.color = "transparent";
  }

  // ====== ACTIONS ======
  function startGame() {
    state = GameState.PLAY;
    hint.textContent = "Tap FEED to score.";

    score = 0;
    drawScore(score);

    burgerActive = false;
    chewUntil = 0;
    popups.length = 0;

    // Start music after user gesture (iOS/Safari requirement)
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

    // Open mouth briefly right away
    mouthOpenUntil = now() + MOUTH_OPEN_MS;

    // Start burger flight
    burgerActive = true;
    burgerStartTs = now();

    // Score increments on press
    score += 1;
    drawScore(score);

    // Popup +1
    addPopup(1);
  }

  // ====== INPUT ======
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === GameState.TITLE) startGame();
  });

  htmlFeedBtn.addEventListener("click", () => {
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

  // ====== RENDER ======
  function renderTitle() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    if (img.title) drawCover(img.title);

    // Hint bar at bottom
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

    // Choose Michael frame:
    // - During chew: alternate open/idle
    // - Else if mouth-open window: open
    // - Else: idle
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

    // Burger flight animation
    if (burgerActive && img.burger) {
      const t0 = (ts - burgerStartTs) / BURGER.durationMs;
      const t = clamp(t0, 0, 1);

      // Ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);

      const xWobble = Math.sin(t * Math.PI) * BURGER.wobble;
      const x = BURGER.startX + (BURGER.endX - BURGER.startX) * ease + xWobble;
      const y = BURGER.startY + (BURGER.endY - BURGER.startY) * ease;

      // Burger size relative to Michael
      const burgerBaseScale = Math.min(1.0, michaelScale * 0.55);
      const shrink = 1 - (0.25 * t);
      const s = burgerBaseScale * shrink;

      const bw = Math.floor(img.burger.width * s);
      const bh = Math.floor(img.burger.height * s);

      ctx.drawImage(img.burger, Math.floor(x - bw / 2), Math.floor(y - bh / 2), bw, bh);

      if (t >= 1) {
        burgerActive = false;
        chewUntil = ts + CHEW_TOTAL_MS;
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

  // ====== BOOT ======
  async function boot() {
    hint.textContent = "Loading…";

    const entries = Object.entries(ASSETS);
    for (const [key, src] of entries) {
      img[key] = await loadImage(src);
    }

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
