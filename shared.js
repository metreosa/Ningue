// ── shared.js ─────────────────────────────────────────────────────────────────
// Shared utilities across all pages:
//   - Background canvas animation (same water-flow as homepage)
//   - Wallet connect (Keplr)
//   - API helpers (fetch wrapper that handles x402 payment flow)
//   - Toast notifications
//   - Nav active link
// ─────────────────────────────────────────────────────────────────────────────

// If running locally on separate ports, use localhost:3001. If deployed, use relative path.
const API = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

// ── Toast ────────────────────────────────────────────────────────────────────
export function showToast(msg, duration = 3000) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

// ── Active nav link ──────────────────────────────────────────────────────────
export function setActiveNav() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link, .ss-link, .sidebar-pill').forEach(link => {
    if (link.getAttribute('href') === page) link.classList.add('active');
  });
}

// ── Wallet ───────────────────────────────────────────────────────────────────
let walletAddress = null;

export async function connectWallet() {
  const btn = document.getElementById('walletBtn');

  if (walletAddress) {
    showToast('Wallet already connected: ' + walletAddress.slice(0,8) + '...');
    return walletAddress;
  }

  // Try Keplr first (Injective native)
  if (window.keplr) {
    try {
      await window.keplr.enable('injective-1');
      const signer   = window.keplr.getOfflineSigner('injective-1');
      const accounts = await signer.getAccounts();
      walletAddress  = accounts[0].address;

      if (btn) {
        btn.textContent = walletAddress.slice(0,6) + '...' + walletAddress.slice(-4);
        btn.classList.add('connected');
      }
      localStorage.setItem('inj_wallet', walletAddress);
      showToast('✅ Connected: ' + walletAddress.slice(0,8) + '...');
      return walletAddress;
    } catch (e) {
      showToast('Keplr connection failed: ' + e.message);
    }
  }

  // Try MetaMask (EVM, for CCTP from EVM chains)
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      walletAddress  = accounts[0];
      if (btn) {
        btn.textContent = walletAddress.slice(0,6) + '...' + walletAddress.slice(-4);
        btn.classList.add('connected');
      }
      showToast('✅ MetaMask connected');
      return walletAddress;
    } catch (e) {
      showToast('MetaMask connection failed');
    }
  }

  showToast('⚠️  Please install Keplr or MetaMask');
  return null;
}

export function getWalletAddress() {
  return walletAddress || localStorage.getItem('inj_wallet');
}

// ── API helpers ──────────────────────────────────────────────────────────────
export async function apiGet(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

/**
 * apiPost with x402 payment handling.
 * If server returns 402, it triggers the x402 payment flow,
 * signs with the connected wallet, and retries automatically.
 */
export async function apiPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };

  // ── First attempt ────────────────────────────────────────────────────────
  let res = await fetch(API + path, {
    method: 'POST', headers, body: JSON.stringify(body)
  });

  // ── 402: Payment required ─────────────────────────────────────────────────
  if (res.status === 402) {
    const paymentReq = await res.json();
    const requirement = paymentReq.accepts?.[0];

    if (!requirement) throw new Error('Invalid 402 response from server');

    showToast(`💳 Payment required: ${requirement.maxAmountRequired} ${requirement.asset}`);

    // Show payment UI to user
    const approved = await showPaymentModal(requirement);
    if (!approved) throw new Error('Payment cancelled by user');

    // Build the payment proof (in production: sign actual on-chain tx via Keplr)
    const proof = await buildPaymentProof(requirement);
    const paymentHeader = Buffer.from(JSON.stringify(proof)).toString('base64');

    // ── Retry with payment header ────────────────────────────────────────────
    res = await fetch(API + path, {
      method: 'POST',
      headers: { ...headers, 'X-Payment': paymentHeader },
      body: JSON.stringify(body)
    });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── x402 payment modal ───────────────────────────────────────────────────────
function showPaymentModal(requirement) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('paymentModal');
    if (!overlay) { resolve(true); return; } // Skip if no modal in page

    // Populate modal
    document.getElementById('payModalAmount')?.innerText &&
      (document.getElementById('payModalAmount').innerText =
        `${requirement.maxAmountRequired} ${requirement.asset}`);

    overlay.classList.add('open');

    const confirmBtn = document.getElementById('payConfirmBtn');
    const cancelBtn  = document.getElementById('payCancelBtn');

    const onConfirm = () => { cleanup(); resolve(true);  };
    const onCancel  = () => { cleanup(); resolve(false); };

    function cleanup() {
      overlay.classList.remove('open');
      confirmBtn?.removeEventListener('click', onConfirm);
      cancelBtn?.removeEventListener('click', onCancel);
    }

    confirmBtn?.addEventListener('click', onConfirm);
    cancelBtn?.addEventListener('click', onCancel);
  });
}

// ── Build x402 payment proof ─────────────────────────────────────────────────
async function buildPaymentProof(requirement) {
  // In production: use Keplr to sign a real USDC MsgSend on Injective
  // The signed tx hash becomes the proof the server verifies on-chain.
  //
  // For demo: return a structured proof with a mock txHash.
  // Replace this with actual Keplr signing logic for production.

  const paymentId = requirement.extra?.paymentId;
  const address   = getWalletAddress() || 'demo_address';

  // Demo txHash — replace with real on-chain transfer in production
  const txHash = 'INJ' + Math.random().toString(36).slice(2, 12).toUpperCase();

  return { txHash, paymentId, payer: address, amount: requirement.maxAmountRequired };
}

// ── Background canvas (topographic water-flow) ────────────────────────────────
export function startBackground(canvasId = 'bgCanvas') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W = window.innerWidth, H = window.innerHeight;
  let mouseX = W * 0.5, mouseY = H * 0.5;
  let lastMouseX = mouseX, lastMouseY = mouseY;
  const trail = [];

  canvas.width = W; canvas.height = H;

  window.addEventListener('resize', () => {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W; canvas.height = H;
  });

  window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

  let last = performance.now();

  function draw(now) {
    requestAnimationFrame(draw);
    const delta   = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;

    // Update mouse trail
    const moved = Math.hypot(mouseX - lastMouseX, mouseY - lastMouseY);
    if (moved > 6) {
      trail.push({ x: mouseX, y: mouseY, vx: (mouseX - lastMouseX) * 0.08, vy: (mouseY - lastMouseY) * 0.08, age: 0, maxAge: 1.0, intensity: Math.min(1.8, moved / 12) });
      lastMouseX = mouseX; lastMouseY = mouseY;
    }
    if (trail.length > 20) trail.shift();
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i];
      p.age += delta; p.x += p.vx * delta * 50; p.y += p.vy * delta * 50;
      p.vx *= 0.94; p.vy *= 0.94;
      if (p.age >= p.maxAge) trail.splice(i, 1);
    }

    ctx.clearRect(0, 0, W, H);

    const spacing = 24, lines = Math.ceil(H / spacing) + 2;
    for (let i = 0; i < lines; i++) {
      const baseY = (i - 1) * spacing, ny = baseY / H;
      const active = trail.filter(p => Math.abs(baseY - p.y) < 280);

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(215,218,232,0.06)';
      ctx.lineWidth = 1;

      for (let x = 0; x <= W; x += 8) {
        const nx = x / W;
        let wave =
          Math.sin(nx * 5.5 + t * 0.55) * 9 +
          Math.sin(nx * 11  - t * 0.38 + ny * 4.2) * 5 +
          Math.sin(nx * 2.8 + ny * 7   + t * 0.28) * 13 +
          Math.cos(nx * 8.5 + t * 0.48 + ny * 1.8) * 4;

        let ripple = 0;
        for (const p of active) {
          const dx = nx - p.x / W, dy = ny - p.y / H;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const waveR = p.age * 0.65;
          if (dist < waveR + 0.25) {
            const td = 1 - p.age / p.maxAge;
            const dd = Math.exp(-dist * 4.5);
            ripple += Math.sin((dist - waveR) * 26) * 34 * p.intensity * td * dd;
          }
        }

        const y = baseY + wave + ripple;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  requestAnimationFrame(draw);
}

// ── Countdown timer ──────────────────────────────────────────────────────────
export function countdown(targetDate, el) {
  function update() {
    const diff = new Date(targetDate) - Date.now();
    if (diff <= 0) { el.textContent = 'Starting now'; return; }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000)  / 1000);
    el.textContent = `${h}h ${m}m ${s}s`;
  }
  update();
  return setInterval(update, 1000);
}

// ── Format date ──────────────────────────────────────────────────────────────
export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

// ── Format pool ──────────────────────────────────────────────────────────────
export function fmtPool(str) { return str; }

// ── Init nav wallet button ────────────────────────────────────────────────────
export function initNav() {
  setActiveNav();
  const btn = document.getElementById('walletBtn');
  if (btn) btn.addEventListener('click', connectWallet);

  // Restore wallet if previously connected
  const saved = localStorage.getItem('inj_wallet');
  if (saved && btn) {
    walletAddress = saved;
    btn.textContent = saved.slice(0,6) + '...' + saved.slice(-4);
    btn.classList.add('connected');
  }

  // Sidebar toggle logic
  const toggleHeaders = document.querySelectorAll('.ss-toggle');
  toggleHeaders.forEach(header => {
    header.addEventListener('click', () => {
      header.classList.toggle('collapsed');
      const linksContainer = header.nextElementSibling;
      if (linksContainer && linksContainer.classList.contains('ss-links')) {
        linksContainer.classList.toggle('collapsed');
      }
    });
  });
}

export function getTeamColor(teamNameOrId) {
  const clean = (teamNameOrId || '').toLowerCase().trim();
  const mapping = {
    // Brazil
    'br': '#FEDF00', 'bra': '#FEDF00', 'brazil': '#FEDF00',
    // Argentina
    'ar': '#75AADB', 'arg': '#75AADB', 'argentina': '#75AADB',
    // France
    'fr': '#21409A', 'fra': '#21409A', 'france': '#21409A',
    // Germany
    'de': '#111111', 'ger': '#111111', 'germany': '#111111',
    // Spain
    'es': '#C60B1E', 'esp': '#C60B1E', 'spain': '#C60B1E',
    // England
    'en': '#CE1126', 'eng': '#CE1126', 'england': '#CE1126',
    // USA
    'us': '#3C3B6E', 'usa': '#3C3B6E', 'united states': '#3C3B6E',
    // Morocco
    'ma': '#C1272D', 'mar': '#C1272D', 'morocco': '#C1272D',
    // Netherlands
    'nl': '#FF9B00', 'ned': '#FF9B00', 'netherlands': '#FF9B00',
    // Portugal
    'pt': '#E42828', 'por': '#E42828', 'portugal': '#E42828',
    // Japan
    'jp': '#BC002D', 'jpn': '#BC002D', 'japan': '#BC002D',
    // Croatia
    'hr': '#FF0000', 'cro': '#FF0000', 'croatia': '#FF0000',
    // Colombia
    'co': '#FCD116', 'col': '#FCD116', 'colombia': '#FCD116',
    // Senegal / mg
    'mg': '#00853F', 'sen': '#00853F', 'senegal': '#00853F',
    // Italy
    'it': '#008C45', 'ita': '#008C45', 'italy': '#008C45',
    // Belgium
    'be': '#000000', 'bel': '#000000', 'belgium': '#000000',
    // Uruguay
    'uy': '#0081C8', 'uru': '#0081C8', 'uruguay': '#0081C8',
    // Switzerland
    'ch': '#D52B1E', 'sui': '#D52B1E', 'switzerland': '#D52B1E',
    // Al Hilal
    'al hilal': '#005CA9',
    // Al Nassr
    'al nassr': '#FFF200'
  };
  
  return mapping[clean] || '#00C6C6';
}
