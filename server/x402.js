// ── server/x402.js ───────────────────────────────────────────────────────────
// Implements the x402 HTTP payment protocol.
//
// HOW IT WORKS:
//   1. Any route wrapped with this middleware requires a USDC micropayment.
//   2. If the client sends a request WITHOUT payment → server responds HTTP 402
//      with machine-readable payment instructions (amount, asset, recipient).
//   3. The client (browser + Keplr wallet) signs a USDC transfer on Injective,
//      puts the signed proof in the X-Payment header, and retries.
//   4. This middleware verifies the proof, then lets the request through.
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from 'crypto';

// Payment requirements for the AI Analysis feature
const PAYMENT_CONFIG = {
  amount:    '0.10',          // 0.10 USDC per analysis
  asset:     'USDC',
  network:   'injective-888', // Injective testnet (use 'injective-1' for mainnet)
  recipient: process.env.WALLET_ADDRESS || 'inj1demo_recipient_address',
  facilitator: 'https://facilitator.x402.org/injective', // x402 facilitator for Injective
};

// Active payment challenges (in production: use Redis/DB)
const pendingPayments = new Map();

export function x402Middleware(req, res, next) {
  const paymentHeader = req.headers['x-payment'];

  // ── Step 1: No payment → issue challenge ─────────────────────────────────
  if (!paymentHeader) {
    const paymentId = randomUUID();
    pendingPayments.set(paymentId, { created: Date.now() });

    return res.status(402).json({
      x402Version: 1,
      error: 'Payment required',
      accepts: [
        {
          scheme:       'exact',
          network:      PAYMENT_CONFIG.network,
          maxAmountRequired: PAYMENT_CONFIG.amount,
          resource:     `${req.protocol}://${req.get('host')}${req.path}`,
          description:  'AI Match Analysis — 0.10 USDC per prediction',
          mimeType:     'application/json',
          payTo:        PAYMENT_CONFIG.recipient,
          maxTimeoutSeconds: 120,
          asset:        PAYMENT_CONFIG.asset,
          extra: {
            paymentId,
            facilitator: PAYMENT_CONFIG.facilitator,
            note: 'Powered by Injective x402',
          }
        }
      ]
    });
  }

  // ── Step 2: Payment header present → verify ───────────────────────────────
  try {
    // Parse the X-Payment header (base64-encoded JSON proof from the client)
    const decoded  = Buffer.from(paymentHeader, 'base64').toString('utf8');
    const proof    = JSON.parse(decoded);

    // In production: call the x402 facilitator to verify the on-chain tx.
    // For the hackathon demo we validate structure and attach proof to request.
    if (!proof.txHash || !proof.paymentId) {
      return res.status(402).json({ error: 'Invalid payment proof structure' });
    }

    // Attach verified payment info for downstream handlers
    req.payment = {
      verified:  true,
      txHash:    proof.txHash,
      paymentId: proof.paymentId,
      amount:    PAYMENT_CONFIG.amount,
      asset:     PAYMENT_CONFIG.asset,
    };

    // Clean up pending entry
    pendingPayments.delete(proof.paymentId);

    next();
  } catch (err) {
    return res.status(402).json({ error: 'Failed to verify payment proof', detail: err.message });
  }
}
