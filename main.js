/**
 * main.js — Injective World Cup Homepage
 *
 * 1. Animated topographic water-flow background (2-D canvas)
 * 2. Mouse-driven 3-D tilt on the ball image (CSS perspective)
 * 3. White background removal from ball image (canvas pixel processing)
 */

// ═══════════════════════════════════════════════════════════
//  WHITE BACKGROUND REMOVAL
// ═══════════════════════════════════════════════════════════
/**
 * Removes white/near-white pixels from an <img> element.
 * Uses brightness + saturation thresholds so ball colours are untouched.
 * Replaces the img src with a processed blob URL.
 */
function removeBallBg(imgEl) {
  const off = document.createElement('canvas');
  const ctx = off.getContext('2d');
  off.width  = imgEl.naturalWidth;
  off.height = imgEl.naturalHeight;
  ctx.drawImage(imgEl, 0, 0);

  const imgData = ctx.getImageData(0, 0, off.width, off.height);
  const d = imgData.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];

    const brightness  = (r + g + b) / 3;
    const saturation  = Math.max(r, g, b) - Math.min(r, g, b);

    // White/light-grey detection: bright AND desaturated
    if (brightness > 205 && saturation < 45) {
      // Soft fade — fully transparent for pure white, partial for near-white
      const alpha = Math.max(0, 1 - (brightness - 205) / 50);
      d[i + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Replace img src with processed transparent version
  off.toBlob(blob => {
    imgEl.src = URL.createObjectURL(blob);
  }, 'image/png');
}

(() => {

  let W = window.innerWidth;
  let H = window.innerHeight;

  let mouseX = W * 0.5;
  let mouseY = H * 0.5;

  // ═══════════════════════════════════════════════════════════
  //  BACKGROUND — water-flow topographic lines
  // ═══════════════════════════════════════════════════════════
  const bgCanvas = document.getElementById('bgCanvas');
  const bgCtx    = bgCanvas.getContext('2d');

  function resizeBg() {
    bgCanvas.width  = W;
    bgCanvas.height = H;
  }
  resizeBg();

  function drawBackground(t) {
    bgCtx.clearRect(0, 0, W, H);

    const mx = mouseX / W;
    const my = mouseY / H;

    const spacing   = 22;
    const lineCount = Math.ceil(H / spacing) + 2;

    for (let i = 0; i < lineCount; i++) {
      const baseY = (i - 1) * spacing;
      const ny    = baseY / H;

      bgCtx.beginPath();
      bgCtx.strokeStyle = 'rgba(215, 218, 232, 0.058)';
      bgCtx.lineWidth   = 1;

      for (let x = 0; x <= W; x += 4) {
        const nx = x / W;

        const dx   = nx - mx;
        const dy   = ny - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const pull = Math.max(0, 1 - dist * 2.8) * 28;

        const wave =
          Math.sin(nx * 5.5  + t * 0.55)            *  9 +
          Math.sin(nx * 11   - t * 0.38 + ny * 4.2) *  5 +
          Math.sin(nx * 2.8  + ny * 7   + t * 0.28) * 13 +
          Math.cos(nx * 8.5  + t * 0.48 + ny * 1.8) *  4 +
          pull * Math.sin(t * 1.1 + dist * 6);

        const y = baseY + wave;
        if (x === 0) bgCtx.moveTo(x, y);
        else         bgCtx.lineTo(x, y);
      }

      bgCtx.stroke();
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  BALL TILT — subtle 3-D tilt following the mouse
  // ═══════════════════════════════════════════════════════════
  const ballWrap = document.getElementById('ballWrap');
  const ballImg  = document.getElementById('ballImg');

  // Strip white background as soon as the image is available
  if (ballImg.complete && ballImg.naturalWidth > 0) {
    removeBallBg(ballImg);
  } else {
    ballImg.addEventListener('load', () => removeBallBg(ballImg), { once: true });
  }

  // Current and target tilt angles
  let tiltX = 0, tiltY = 0;
  let targetTiltX = 0, targetTiltY = 0;

  window.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    // Normalise to -1 … +1
    const nx = (e.clientX / W) * 2 - 1;
    const ny = (e.clientY / H) * 2 - 1;

    // Max ±12° tilt
    targetTiltX = -ny * 12;
    targetTiltY =  nx * 12;
  });

  // ═══════════════════════════════════════════════════════════
  //  RESIZE
  // ═══════════════════════════════════════════════════════════
  window.addEventListener('resize', () => {
    W = window.innerWidth;
    H = window.innerHeight;
    resizeBg();
  });

  // ═══════════════════════════════════════════════════════════
  //  ANIMATION LOOP
  // ═══════════════════════════════════════════════════════════
  let last = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);
    const delta   = Math.min((now - last) / 1000, 0.05);
    last = now;
    const elapsed = now / 1000;

    // Smooth tilt interpolation
    const lerpFactor = 1 - Math.pow(0.02, delta);
    tiltX += (targetTiltX - tiltX) * lerpFactor;
    tiltY += (targetTiltY - tiltY) * lerpFactor;

    // Apply 3-D tilt to ball (CSS transform)
    // The float animation lives in CSS; we only add the tilt on top
    ballImg.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;

    // Draw background
    drawBackground(elapsed);
  }

  requestAnimationFrame(animate);

})();
