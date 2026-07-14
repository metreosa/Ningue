// ── server/cctp.js ────────────────────────────────────────────────────────────
// Circle CCTP (Cross-Chain Transfer Protocol) helpers.
//
// HOW IT WORKS:
//   CCTP lets users move USDC from any chain (Ethereum, Base, Solana, etc.)
//   to Injective WITHOUT a bridge or wrapped token. It's a burn-and-mint:
//     1. USDC is BURNED on the source chain
//     2. Circle signs a proof (attestation) that it happened
//     3. Native USDC is MINTED on Injective for the recipient
//
//   This file provides helper endpoints the frontend calls during that process.
// ─────────────────────────────────────────────────────────────────────────────

// Circle's IRIS attestation API
const IRIS_API = 'https://iris.circle.com/v2/messages';

// CCTP domain IDs (each chain has a unique domain in the protocol)
export const CCTP_DOMAINS = {
  ethereum:  { id: 0, name: 'Ethereum',  chainId: 1,     rpc: 'https://eth.llamarpc.com' },
  avalanche: { id: 1, name: 'Avalanche', chainId: 43114, rpc: 'https://api.avax.network/ext/bc/C/rpc' },
  optimism:  { id: 2, name: 'Optimism',  chainId: 10,    rpc: 'https://mainnet.optimism.io' },
  arbitrum:  { id: 3, name: 'Arbitrum',  chainId: 42161, rpc: 'https://arb1.arbitrum.io/rpc' },
  base:      { id: 6, name: 'Base',      chainId: 8453,  rpc: 'https://mainnet.base.org' },
  injective: { id: 22, name: 'Injective', chainId: null, rpc: 'https://sentry.tm.injective.network' },
};

// TokenMessenger contract addresses on each source chain (where you burn USDC)
export const TOKEN_MESSENGER = {
  ethereum:  '0xBd3fa81B58Ba92a82136038B25aDec7066af3155',
  avalanche: '0x6B25532e1060CE10cc3B0A99e5683b91BFDe6982',
  optimism:  '0x2B4069517957735bE00ceE0fadAE88a26365528F',
  arbitrum:  '0x19330d10D9Cc8751218eaf51E8885D058642E08A',
  base:      '0x1682Ae6375C4E4A97e4B583BC394c861A46D8962',
};

// USDC contract addresses on source chains
export const USDC_CONTRACTS = {
  ethereum:  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  avalanche: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  optimism:  '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  arbitrum:  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  base:      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

/**
 * Poll Circle's IRIS API until the attestation is ready.
 * This is called after the user burns USDC on the source chain.
 * Returns the signed attestation needed to mint on Injective.
 */
export async function pollAttestation(messageHash, sourceDomain) {
  const maxAttempts = 40; // ~2 minutes at 3s intervals
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const url = `${IRIS_API}/${sourceDomain}/${messageHash}`;
      const res  = await fetch(url);

      if (res.ok) {
        const data = await res.json();
        if (data?.messages?.[0]?.status === 'complete') {
          return {
            status:      'complete',
            attestation: data.messages[0].attestation,
            message:     data.messages[0].message,
          };
        }
      }
    } catch (_) {
      // Network blip — keep polling
    }

    // Wait 3 seconds before next check
    await new Promise(r => setTimeout(r, 3000));
  }

  return { status: 'timeout', attestation: null };
}

/**
 * Returns burn transaction parameters for the frontend.
 * The frontend passes these to MetaMask/Keplr to initiate the burn.
 */
export function getBurnParams(sourceChain, amount, recipientOnInjective) {
  const chain    = CCTP_DOMAINS[sourceChain];
  const messenger = TOKEN_MESSENGER[sourceChain];
  const usdc     = USDC_CONTRACTS[sourceChain];

  if (!chain || !messenger) {
    throw new Error(`Unsupported source chain: ${sourceChain}`);
  }

  // Convert human amount to USDC units (6 decimals)
  const amountUnits = Math.floor(parseFloat(amount) * 1_000_000).toString();

  // Pad Injective address to 32 bytes (bytes32 format required by CCTP)
  const recipientBytes32 = '0x' + Buffer.from(
    recipientOnInjective.replace('inj1', ''),
    'ascii'
  ).toString('hex').padStart(64, '0');

  return {
    messenger,
    usdc,
    amount:          amountUnits,
    destinationDomain: CCTP_DOMAINS.injective.id,
    mintRecipient:   recipientBytes32,
    burnToken:       usdc,
    sourceChain:     chain.name,
    sourceChainId:   chain.chainId,
  };
}
