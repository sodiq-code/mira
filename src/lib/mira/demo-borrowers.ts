/**
 * Demo borrower profiles used by the credit-check read path when the frontend
 * is exercised in demo mode.
 *
 * These profiles stand in for live Sepolia RPC reads so the end-to-end flow
 * (connect → verify → decide → originate) is reliable for a live demo. Every
 * response that uses them sets `demoMode: true` and the UI labels them as
 * demo data — real and simulated data are never blurred.
 *
 * Each profile mirrors the shape of a real Attestcoin-verified feature
 * vector: the factors a borrower's Sepolia activity would produce after
 * proof generation + BlockProver verification.
 */

import type { VerifiedFactors } from '@mira/shared';

export interface DemoBorrower {
  /** EIP-55 checksummed address (synthetic, for display only). */
  address: string;
  label: string;
  description: string;
  factors: VerifiedFactors;
  /** Sepolia transaction hashes that "backed" the factors (for proof links). */
  evidenceTxHashes: string[];
}

/**
 * A well-seasoned borrower: 18-month-old wallet, strong stablecoin volume,
 * diverse DeFi activity, no prior MIRA history. The archetypal approve.
 */
const RICH_BORROWER: DemoBorrower = {
  address: '0x4F3eDF6B6d4D8C29F12E8a1B2C3D4E5f6789aBcD',
  label: 'Seasoned DeFi user',
  description:
    '18-month-old wallet with consistent stablecoin activity and broad DeFi usage. The archetypal approval profile.',
  factors: {
    walletAgeDays: 548,
    txCount90d: 142,
    stablecoinVolume90d: 28400,
    defiPositionCount: 7,
    priorMiraLoans: 0,
    priorMiraRepaid: 0,
    priorMiraDefaulted: 0,
  },
  evidenceTxHashes: [
    '0x9a3f1c2b8e7d4a6f5c0b1e2d3a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a',
    '0x7c4b2a9e1f3d5b6c8a0e2d4f6b8c0a2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b',
    '0x2d8e0f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9',
  ],
};

/**
 * A returning borrower with one prior MIRA loan repaid in full. Demonstrates
 * that prior MIRA history feeds back into the decision.
 */
const RETURNING_BORROWER: DemoBorrower = {
  address: '0x8B7c6D5e4F3a2B1c0D9e8F7a6B5c4D3e2F1a0B9c',
  label: 'Returning borrower',
  description:
    'A previous MIRA borrower who repaid on time. Prior history is now part of the verified vector.',
  factors: {
    walletAgeDays: 312,
    txCount90d: 88,
    stablecoinVolume90d: 15600,
    defiPositionCount: 4,
    priorMiraLoans: 1,
    priorMiraRepaid: 1,
    priorMiraDefaulted: 0,
  },
  evidenceTxHashes: [
    '0x5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3',
    '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
  ],
};

/**
 * A brand-new wallet with no activity. The archetypal decline: "insufficient
 * verified activity." Used to demonstrate that MIRA will not invent factors.
 */
const FRESH_WALLET: DemoBorrower = {
  address: '0x0000DeF10000BeeF0000CafE0000DeaD0000Beef',
  label: 'Fresh wallet',
  description:
    'A wallet created days ago with no verified activity. MIRA declines rather than invent factors.',
  factors: {
    walletAgeDays: 6,
    txCount90d: 1,
    stablecoinVolume90d: 0,
    defiPositionCount: 0,
    priorMiraLoans: 0,
    priorMiraRepaid: 0,
    priorMiraDefaulted: 0,
  },
  evidenceTxHashes: [],
};

/**
 * A borrower with a prior default and no repayments. The hard-decline rule:
 * prior_mira_defaulted > 0 && prior_mira_repaid == 0.
 */
const PRIOR_DEFAULT_BORROWER: DemoBorrower = {
  address: '0xDed00Bad00Fa11000Bad00DeaD00Beef00Cafe00',
  label: 'Prior default',
  description:
    'A wallet with a prior MIRA default and no repayments since. Policy mandates a decline.',
  factors: {
    walletAgeDays: 410,
    txCount90d: 54,
    stablecoinVolume90d: 9200,
    defiPositionCount: 2,
    priorMiraLoans: 1,
    priorMiraRepaid: 0,
    priorMiraDefaulted: 1,
  },
  evidenceTxHashes: [
    '0xbad0fa11bad0fa11bad0fa11bad0fa11bad0fa11bad0fa11bad0fa11bad0fa11',
  ],
};

export const DEMO_BORROWERS: DemoBorrower[] = [
  RICH_BORROWER,
  RETURNING_BORROWER,
  FRESH_WALLET,
  PRIOR_DEFAULT_BORROWER,
];

export function findDemoBorrower(address: string): DemoBorrower | undefined {
  const normalized = address.toLowerCase();
  return DEMO_BORROWERS.find((b) => b.address.toLowerCase() === normalized);
}

/**
 * A "medium" borrower reached when a user connects a real MetaMask wallet
 * whose address is not one of the preset demo profiles. We synthesize a
 * deterministic-but-stable factor vector from the address so the same wallet
 * always yields the same factors (reproducible demos) while remaining
 * clearly labelled as demo data.
 */
export function syntheticFactorsForAddress(address: string): VerifiedFactors {
  // Simple deterministic hash → factors. Stable per address, no randomness,
  // so a returning connected wallet sees the same "history" every time.
  let hash = 0;
  const addr = address.toLowerCase();
  for (let i = 0; i < addr.length; i++) {
    hash = (hash * 31 + addr.charCodeAt(i)) >>> 0;
  }
  const rand = (mod: number) => ((hash = (hash * 1103515245 + 12345) >>> 0) % mod);

  return {
    walletAgeDays: 90 + rand(400),
    txCount90d: 30 + rand(90),
    stablecoinVolume90d: 3000 + rand(20000),
    defiPositionCount: 1 + rand(6),
    priorMiraLoans: 0,
    priorMiraRepaid: 0,
    priorMiraDefaulted: 0,
  };
}
