(() => {
  // ====== CONFIG ======
  const ASSETS = {
    title: "assets/title.png",
    background: "assets/background.png",
    idle: "assets/michael_idle.png",
    open: "assets/michael_open.png",
    burger: "assets/burger.png",
    feedBtn: "assets/feed_button.png",
    digits: "assets/digits.png",
  };

  // Base "game resolution" (canvas internal size)
  const W = 360;
  const H = 640;

  // Positioning (tweak if you want)
  const MICHAEL = {
    x: W / 2,
    y: 310,
    scale: 1.0,
  };

  const BURGER = {
    startX: W / 2,
    startY: 520,
    endY: 318,       // target near mouth
    durationMs: 320, // flight time
    wobble: 10,
  };

  const MOUTH_OPEN_MS = 260;

  // ====== DOM ======
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  const scoreCanvas = document.getElementById("score");
  const scoreCtx = scoreCanvas.getContext("2d", { alpha: true });

  const htmlFeedBtn = document.getElementById("feedBtn");
  const hint = document.getElementById("hint");

  // Pixel-perfect rendering
  ctx.imageSmoothingEnabled = false;
  scoreCtx.imageSmoothingEnabled = false;

  // ====== STATE ======
  const GameState = {
    TITLE: "TITLE",
    PLAY: "PLAY",
  };

  let state = GameState.TITLE;
  let score = 0;

  let lastTs = 0;

  // mouth animation
  let mouthOpenUntil = 0;

  // burger animation
  let burgerActive = false;
  let burgerStartTs = 0;

  // loaded images
  const img = {};

  // ====== HELPERS ======
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = src;
    });
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function now() {
    return performance.now();
  }

  // Draw an image centered at (x,y) with scale, using its natural size
  function drawCentered(image, x, y, scale = 1) {
    const w = Math.floor(image.width * scale);
    const h = Math.floor(image.height * scale);
    ctx.drawImage(image, Math.floor(x - w / 2), Math.floor(y - h / 2), w, h);
  }

  // ====== SCORE RENDER (using digits sprite sheet) ======
  // Assumes digits.png contains 0-9 in a grid or row.
  // We'll auto-detect: if it's wide, assume row of 10 digits.
  // If it’s more square, still treat as row by splitting width / 10.
  function drawScore(n) {
    const dimg = img.digits;
    if (!dimg) return;

    scoreCtx.clearRect(0, 0, scoreCanvas.width, scoreCanvas.height);

    const text = String(n);
    const digitW = Math.floor(dimg.width / 10);
    const digitH = dimg.height; // row
    const scale = 2; // scale digits up for readability

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

  // ====== UI BUTTON (optional: draw sprite, but we use real button for taps) ======
  // If you want the FEED button to look like your sprite art,
  // we’ll set it as a CSS background image once loaded.
  function skinFeedButton() {
    const b = img.feedBtn;
    if (!b) return;
    // Use the image as the button background
    htmlFeedBtn.style.backgroundImage = `url(${ASSETS.feedBtn})`;
    htmlFeedBtn.style.backgroundSize = "contain";
    htmlFeedBtn.style.backgroundRepeat = "no-repeat";
    htmlFeedBtn.style.backgroundPosition = "center";
    htmlFeedBtn.style.color = "transparent"; // hide text; keeps accessibility label
    htmlFeedBtn.style.textShadow = "none";
  }

  // ====== GAME ACTION ======
  function startGame() {
    state = GameState.PLAY;
    hint.textContent = "Tap FEED to score.";
    score = 0;
    drawScore(score);
  }

  function doFeed() {
    if (state !== GameState.PLAY) return;

    // open mouth briefly
    mouthOpenUntil = now() + MOUTH_OPEN_MS;

    // start burger animation
    burgerActive = true;
    burgerStartTs = now();

    // score immediately (per your spec)
    score += 1;
    drawScore(score);
  }

  // ====== INPUT ======
  // Title screen: tap canvas to start
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === GameState.TITLE) startGame();
  });

  htmlFeedBtn.addEventListener("click", () => {
    if (state === GameState.TITLE) {
      startGame();
      return;
    }
    doFeed();
  });

  // keyboard fallback
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      if (state === GameState.TITLE) startGame();
      else doFeed();
    }
  });

  // ====== RENDER ======
  function renderTitle() {
    // black fill in case title has transparency
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    const t = img.title;
    if (t) {
      // cover-fit: draw title to fill canvas while preserving aspect
      const scale = Math.max(W / t.width, H / t.height);
      const dw = Math.floor(t.width * scale);
      const dh = Math.floor(t.height * scale);
      const dx = Math.floor((W - dw) / 2);
      const dy = Math.floor((H - dh) / 2);
      ctx.drawImage(t, dx, dy, dw, dh);
    }

    // subtle hint
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, H - 56, W, 56);

    ctx.fillStyle = "#fff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Tap screen or press FEED to start", W / 2, H - 24);
  }

  function renderPlay(ts) {
    // Background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    const bg = img.background;
    if (bg) {
      const scale = Math.max(W / bg.width, H / bg.height);
      const dw = Math.floor(bg.width * scale);
      const dh = Math.floor(bg.height * scale);
      const dx = Math.floor((W - dw) / 2);
      const dy = Math.floor((H - dh) / 2);
      ctx.drawImage(bg, dx, dy, dw, dh);
    }

    // Michael (idle or open)
    const michaelImg = (ts < mouthOpenUntil) ? img.open : img.idle;
    if (michaelImg) {
      drawCentered(michaelImg, MICHAEL.x, MICHAEL.y, MICHAEL.scale);
    }

    // Burger animation (fly upward into mouth)
    if (burgerActive && img.burger) {
      const t = clamp((ts - burgerStartTs) / BURGER.durationMs, 0, 1);

      // ease-out
      const ease = 1 - Math.pow(1 - t, 3);

      const xWobble = Math.sin(t * Math.PI) * BURGER.wobble;
      const x = BURGER.startX + xWobble;
      const y = BURGER.startY + (BURGER.endY - BURGER.startY) * ease;

      // small scale-down as it "enters" mouth
      const s = 1.0 - (0.25 * t);

      // draw burger centered
      const bw = Math.floor(img.burger.width * s);
      const bh = Math.floor(img.burger.height * s);
      ctx.drawImage(img.burger, Math.floor(x - bw / 2), Math.floor(y - bh / 2), bw, bh);

      if (t >= 1) burgerActive = false;
    }
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;

    ctx.imageSmoothingEnabled = false;

    if (state === GameState.TITLE) renderTitle();
    else renderPlay(ts);

    lastTs = ts;
    requestAnimationFrame(loop);
  }

  // ====== BOOT ======
  async function boot() {
    hint.textContent = "Loading…";

    // Preload all images
    const entries = Object.entries(ASSETS);
    for (const [key, src] of entries) {
      img[key] = await loadImage(src);
    }

    // Skin the feed button with your pixel-art button
    skinFeedButton();

    // Init score
    drawScore(score);

    hint.textContent = "Tap the screen to start.";
    requestAnimationFrame(loop);
  }

  boot().catch((err) => {
    console.error(err);
    hint.textContent = "Error loading assets. Check filenames in /assets/.";
  });
})();