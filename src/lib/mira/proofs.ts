/**
 * Demo-mode Attestcoin proof generation.
 *
 * In production, every factor MIRA underwrites is backed by an Attestcoin
 * inclusion proof that the Creditcoin BlockProver precompile verifies
 * on-chain (see packages/worker/src/attestcoin.ts). For a reliable live
 * demo we synthesize proof artifacts that have the same shape as the real
 * ones — a merkle proof, a continuity proof, and a CC3 verification
 * transaction hash — and we label them as demo data throughout the UI.
 *
 * The proof objects are deterministic per input so the same borrower always
 * sees the same evidence (reproducible demos).
 */

import type { VerifiedFactors } from '@mira/shared';
import { cc3TxUrl } from './explorer';

export interface DemoProof {
  /** What this proof attests (e.g. "90d stablecoin volume"). */
  label: string;
  /** The Sepolia transaction that was proven. */
  sepoliaTxHash: string;
  /** The CC3 transaction that verified the proof on-chain. */
  cc3VerificationTxHash: string;
  /** CC3 block height at which the proof was verified. */
  verifiedAtBlock: number;
  /** Simulated merkle inclusion proof (truncated for display). */
  merkleProof: string;
  /** Simulated continuity proof (truncated for display). */
  continuityProof: string;
  /** Explorer link for the CC3 verification transaction. */
  cc3ExplorerUrl: string;
}

const CC3_BASE_BLOCK = 4_820_000;

/**
 * Build a set of demo proofs — one per non-zero factor — for a borrower.
 * Each proof links the Sepolia evidence transaction to a CC3 verification
 * transaction, mirroring the real read path.
 */
export function buildDemoProofs(
  factors: VerifiedFactors,
  evidenceTxHashes: string[],
): DemoProof[] {
  const proofs: DemoProof[] = [];
  let blockOffset = 0;

  const factorLabels: Array<[keyof VerifiedFactors, string]> = [
    ['walletAgeDays', 'Wallet age'],
    ['txCount90d', '90-day transaction count'],
    ['stablecoinVolume90d', '90-day stablecoin volume'],
    ['defiPositionCount', 'DeFi position count'],
  ];

  for (const [key, label] of factorLabels) {
    const value = factors[key];
    // Only emit a proof for factors that have meaningful activity.
    if (value === 0 && key !== 'walletAgeDays') continue;

    const sepoliaTx =
      evidenceTxHashes[proofs.length % Math.max(evidenceTxHashes.length, 1)] ??
      synthesizeTxHash(`${factors.walletAgeDays}-${key}`);
    const cc3Tx = synthesizeTxHash(`cc3-${sepoliaTx}-${blockOffset}`);
    const verifiedAtBlock = CC3_BASE_BLOCK + blockOffset;

    proofs.push({
      label,
      sepoliaTxHash: sepoliaTx,
      cc3VerificationTxHash: cc3Tx,
      verifiedAtBlock,
      merkleProof: synthesizeHex(`merkle-${sepoliaTx}`, 64),
      continuityProof: synthesizeHex(`cont-${cc3Tx}`, 64),
      cc3ExplorerUrl: cc3TxUrl(cc3Tx),
    });
    blockOffset += 3;
  }

  return proofs;
}

/** Deterministic 0x-prefixed hex string from a seed (for fake hashes/proofs). */
function synthesizeTxHash(seed: string): string {
  return `0x${synthesizeHex(seed, 64)}`;
}

function synthesizeHex(seed: string, length: number): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let out = '';
  let h = hash;
  while (out.length < length) {
    h = Math.imul(h + 0x9e3779b9, 0x85ebca6b) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  return out.slice(0, length);
}

/**
 * A pseudo loan id that looks like a Creditcoin contract address. Real loan
 * ids are the originated Loan contract address on CC3 Testnet; for the demo
 * we synthesize a 20-byte hex address.
 */
export function synthesizeLoanId(seed: string): string {
  return `0x${synthesizeHex(`loan-${seed}`, 40)}`;
}

/** A pseudo CC3 extrinsic hash for the demo origination transaction. */
export function synthesizeOriginTxHash(seed: string): string {
  return synthesizeTxHash(`origin-${seed}`);
}
