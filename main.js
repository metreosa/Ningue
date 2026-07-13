/**
 * main.js — Injective World Cup Homepage
 *
 * 1. Animated topographic water-flow background (2-D canvas)
 * 2. Mouse-driven 3-D tilt on the ball image (CSS perspective)
 * 3. White background removal from ball image (canvas pixel processing)
 */


(() => {

  let W = window.innerWidth;
  let H = window.innerHeight;

  let mouseX = W * 0.5;
  let mouseY = H * 0.5;
  let lastMouseX = mouseX;
  let lastMouseY = mouseY;

  // Track recent mouse positions for trailing ripple waves
  const mouseTrail = [];

  window.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // ═══════════════════════════════════════════════════════════
  //  BACKGROUND — water-flow topographic lines with liquid mercury distortion
  // ═══════════════════════════════════════════════════════════
  const bgCanvas = document.getElementById('bgCanvas');
  const bgCtx    = bgCanvas.getContext('2d');

  function resizeBg() {
    bgCanvas.width  = W;
    bgCanvas.height = H;
  }
  resizeBg();

  function drawBackground(t, delta) {
    bgCtx.clearRect(0, 0, W, H);

    // Add new ripple point if mouse moved significantly
    const distMoved = Math.sqrt((mouseX - lastMouseX)**2 + (mouseY - lastMouseY)**2);
    if (distMoved > 6) {
      mouseTrail.push({
        x: mouseX,
        y: mouseY,
        vx: (mouseX - lastMouseX) * 0.08,
        vy: (mouseY - lastMouseY) * 0.08,
        age: 0,
        maxAge: 1.0, // seconds
        intensity: Math.min(1.8, distMoved / 12)
      });
      lastMouseX = mouseX;
      lastMouseY = mouseY;
    }

    // Limit trail length for performance
    if (mouseTrail.length > 20) {
      mouseTrail.shift();
    }

    // Update trail physics (inertia, drift, age)
    for (let i = mouseTrail.length - 1; i >= 0; i--) {
      const pt = mouseTrail[i];
      pt.age += delta;
      pt.x += pt.vx * delta * 50;
      pt.y += pt.vy * delta * 50;
      pt.vx *= 0.94; // damp velocity
      pt.vy *= 0.94;

      if (pt.age >= pt.maxAge) {
        mouseTrail.splice(i, 1);
      }
    }

    const spacing   = 24; // slightly wider for cleaner aesthetics
    const lineCount = Math.ceil(H / spacing) + 2;

    for (let i = 0; i < lineCount; i++) {
      const baseY = (i - 1) * spacing;
      const ny    = baseY / H;

      // Optimisation: pre-filter trail points close to this specific line
      const activeTrail = [];
      for (let j = 0; j < mouseTrail.length; j++) {
        const pt = mouseTrail[j];
        if (Math.abs(baseY - pt.y) < 280) {
          activeTrail.push(pt);
        }
      }

      bgCtx.beginPath();
      bgCtx.strokeStyle = 'rgba(215, 218, 232, 0.06)';
      bgCtx.lineWidth   = 1;

      // Step by 8 instead of 4 for 2x rendering performance
      for (let x = 0; x <= W; x += 8) {
        const nx = x / W;

        // Base organic ocean flow
        let wave =
          Math.sin(nx * 5.5  + t * 0.55)            *  9 +
          Math.sin(nx * 11   - t * 0.38 + ny * 4.2) *  5 +
          Math.sin(nx * 2.8  + ny * 7   + t * 0.28) * 13 +
          Math.cos(nx * 8.5  + t * 0.48 + ny * 1.8) *  4;

        // Mercury ripple displacement
        let rippleSum = 0;
        for (let j = 0; j < activeTrail.length; j++) {
          const pt = activeTrail[j];
          const px = pt.x / W;
          const py = pt.y / H;

          const dx = nx - px;
          const dy = ny - py;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Wave front propagates outwards with age
          const waveRadius = pt.age * 0.65;
          const distFromFront = Math.abs(dist - waveRadius);

          if (dist < waveRadius + 0.25) {
            const timeDecay = 1.0 - (pt.age / pt.maxAge);
            const distDecay = Math.exp(-dist * 4.5);
            // High frequency, quick decay, viscous ripple
            const wavePhase = (dist - waveRadius) * 26.0;
            rippleSum += Math.sin(wavePhase) * 34.0 * pt.intensity * timeDecay * distDecay;
          }
        }

        const y = baseY + wave + rippleSum;
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
    drawBackground(elapsed, delta);
  }

  requestAnimationFrame(animate);

})();
