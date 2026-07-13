/**
 * main.js — Injective World Cup Homepage
 *
 * Layers:
 *  0. bgCanvas  — 2-D water-flow / topographic line animation
 *  1. ballCanvas — Three.js sphere with dual-texture reveal shader
 *
 * Behaviour:
 *  · On load   : ball rushes toward camera (zoom-in intro, ~2 s)
 *  · Default   : World Cup Trionda texture, slow auto-spin
 *  · Hover ball: circular mask follows cursor, reveals Injective texture
 *  · Hover bg  : water-flow lines distort gently toward cursor
 */

(() => {

  // ─── DIMENSIONS ──────────────────────────────────────────────────
  let W = window.innerWidth;
  let H = window.innerHeight;

  // ─── SHARED MOUSE STATE ──────────────────────────────────────────
  let mouseX = W * 0.5;
  let mouseY = H * 0.5;

  window.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // ═══════════════════════════════════════════════════════════════════
  //  LAYER 0 — BACKGROUND WATER FLOW  (2-D canvas)
  // ═══════════════════════════════════════════════════════════════════
  const bgCanvas = document.getElementById('bgCanvas');
  const bgCtx    = bgCanvas.getContext('2d');

  function resizeBg() {
    bgCanvas.width  = W;
    bgCanvas.height = H;
  }
  resizeBg();

  /**
   * Draws animated topographic-style flowing lines.
   * @param {number} t  elapsed time in seconds
   */
  function drawBackground(t) {
    bgCtx.clearRect(0, 0, W, H);

    const mx = mouseX / W;   // normalised 0-1
    const my = mouseY / H;

    const spacing  = 22;
    const lineCount = Math.ceil(H / spacing) + 2;

    for (let i = 0; i < lineCount; i++) {
      const baseY = (i - 1) * spacing;
      const ny    = baseY / H;

      bgCtx.beginPath();
      bgCtx.strokeStyle = 'rgba(215, 218, 232, 0.058)';
      bgCtx.lineWidth   = 1;

      for (let x = 0; x <= W; x += 4) {
        const nx = x / W;

        // Distance from mouse — used to pull lines toward cursor
        const dx   = nx - mx;
        const dy   = ny - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const pull = Math.max(0, 1 - dist * 2.8) * 28;

        // Composite wave — multiple frequencies give organic look
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

  // ═══════════════════════════════════════════════════════════════════
  //  LAYER 1 — THREE.JS BALL
  // ═══════════════════════════════════════════════════════════════════
  const ballCanvas = document.getElementById('ballCanvas');
  ballCanvas.style.pointerEvents = 'all'; // capture mouse for raycaster

  const renderer = new THREE.WebGLRenderer({
    canvas:    ballCanvas,
    antialias: true,
    alpha:     true,          // transparent bg — bgCanvas shows through
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
  camera.position.set(0, 0, 5);   // final resting z

  // ─── LIGHTING ────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
  keyLight.position.set(4, 6, 6);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x88bbff, 0.6);
  fillLight.position.set(-5, -2, 3);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x00c6c6, 0.4);
  rimLight.position.set(0, -6, -4);
  scene.add(rimLight);

  // ─── TEXTURES ────────────────────────────────────────────────────
  const texLoader = new THREE.TextureLoader();

  // tex1 = default (World Cup ball — user's original image)
  const wcTexture  = texLoader.load('assets/wc_ball.jpg');
  // tex2 = revealed on hover (Injective cyan/black — user's original image)
  const injTexture = texLoader.load('assets/inj_ball.jpg');

  // ─── GLSL SHADERS ────────────────────────────────────────────────
  const vertexShader = /* glsl */`
    varying vec2 vUv;
    varying vec3 vLocalPos;   // normalised position on unit sphere
    void main() {
      vUv       = uv;
      vLocalPos = normalize(position); // same space as hoverPoint
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = /* glsl */`
    uniform sampler2D tex1;           // default (WC ball)
    uniform sampler2D tex2;           // hover reveal (INJ ball)
    uniform vec3      hoverPoint;     // normalised 3-D hit point in object space
    uniform float     revealRadius;   // angular radius in radians
    uniform float     revealStrength; // 0 → 1, lerped on/off
    uniform float     uTime;          // elapsed seconds for organic edge wobble

    varying vec2 vUv;
    varying vec3 vLocalPos;

    void main() {
      vec4 c1 = texture2D(tex1, vUv);
      vec4 c2 = texture2D(tex2, vUv);

      // Angular distance on the sphere — no UV seam, no straight-line cuts
      float cosA  = dot(normalize(vLocalPos), hoverPoint);
      float angle = acos(clamp(cosA, -1.0, 1.0));

      // Organic wobble on the reveal edge — makes it feel liquid, not geometric
      // The sine uses the fragment's own angle around the hit point for variation
      vec3 cross1 = cross(normalize(vLocalPos), hoverPoint);
      float edgeAngle = atan(cross1.y, cross1.x); // angle around the circle
      float wobble = sin(edgeAngle * 5.0 + uTime * 1.8) * 0.045
                   + sin(edgeAngle * 9.0 - uTime * 2.5) * 0.02;
      float dynRadius = revealRadius + wobble * revealStrength;

      // Wide, soft smoothstep transition zone (feels like flowing paint)
      float inner = dynRadius * 0.25;
      float outer = dynRadius * 1.15;
      float edge  = 1.0 - smoothstep(inner, outer, angle);

      float reveal = edge * revealStrength;

      gl_FragColor = mix(c1, c2, reveal);
    }
  `;

  // ─── BALL MESH ───────────────────────────────────────────────────
  const ballGeo = new THREE.SphereGeometry(1.55, 128, 128);

  const ballMat = new THREE.ShaderMaterial({
    uniforms: {
      tex1:          { value: wcTexture  },
      tex2:          { value: injTexture },
      hoverPoint:    { value: new THREE.Vector3(0, 1, 0) },
      revealRadius:  { value: 0.55 },  // ~32° angular radius
      revealStrength:{ value: 0.0  },
      uTime:         { value: 0.0  },
    },
    vertexShader,
    fragmentShader,
  });

  const ball = new THREE.Mesh(ballGeo, ballMat);
  scene.add(ball);

  // ─── INTRO ANIMATION ─────────────────────────────────────────────
  // Ball zooms toward camera from far away — like abeto.co
  const INTRO_DURATION = 2.0; // seconds
  let introProgress = 0;
  let introComplete = false;

  // Start state: ball tiny, camera far back
  camera.position.z = 22;
  ball.scale.setScalar(0.15);

  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  // ─── RAYCASTING ──────────────────────────────────────────────────
  const raycaster   = new THREE.Raycaster();
  const mouseNDC    = new THREE.Vector2();
  let isOnBall      = false;
  let targetReveal  = 0;
  let currentReveal = 0;

  ballCanvas.addEventListener('mousemove', e => {
    mouseNDC.x = (e.clientX / W) *  2 - 1;
    mouseNDC.y = (e.clientY / H) * -2 + 1;

    raycaster.setFromCamera(mouseNDC, camera);
    const hits = raycaster.intersectObject(ball);

    if (hits.length > 0) {
      isOnBall     = true;
      targetReveal = 1;
      // Convert world-space hit to normalised object-space direction
      // This matches vLocalPos = normalize(position) in the vertex shader
      const localHit = ball.worldToLocal(hits[0].point.clone()).normalize();
      ballMat.uniforms.hoverPoint.value.copy(localHit);
    } else {
      isOnBall     = false;
      targetReveal = 0;
    }
  });

  ballCanvas.addEventListener('mouseleave', () => {
    isOnBall     = false;
    targetReveal = 0;
  });

  // ─── RESIZE ──────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    W = window.innerWidth;
    H = window.innerHeight;
    resizeBg();
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  });

  // ─── ANIMATION LOOP ──────────────────────────────────────────────
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const delta   = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // ── Intro zoom-in ─────────────────────────────────────────────
    if (!introComplete) {
      introProgress = Math.min(1, introProgress + delta / INTRO_DURATION);
      const e = easeOutExpo(introProgress);
      camera.position.z = 22 - (17 * e);   // 22 → 5
      ball.scale.setScalar(0.15 + 0.85 * e); // 0.15 → 1.0
      if (introProgress >= 1) {
        introComplete     = true;
        camera.position.z = 5;
        ball.scale.setScalar(1);
      }
    }

    // ── Continuous slow spin (pauses feel when hovering) ──────────
    ball.rotation.y += delta * (isOnBall ? 0.04 : 0.13);
    // Subtle gentle tilt bob
    ball.rotation.x = Math.sin(elapsed * 0.35) * 0.04;

    // ── Smooth reveal strength lerp (slower = more fluid feel) ─────
    currentReveal += (targetReveal - currentReveal) * (delta * 4.5);
    ballMat.uniforms.revealStrength.value = currentReveal;
    ballMat.uniforms.uTime.value = elapsed;

    // ── Draw background ───────────────────────────────────────────
    drawBackground(elapsed);

    // ── Render Three.js ───────────────────────────────────────────
    renderer.render(scene, camera);
  }

  animate();

})();
