/**
 * POST /api/credit/check
 *
 * Returns the Attestcoin-verified feature vector for a borrower wallet.
 *
 * In production the worker calls `runCreditCheck` (packages/worker), which
 * fetches the wallet's Sepolia transactions, generates an Attestcoin
 * inclusion proof for each, verifies it against the BlockProver precompile,
 * and computes the factors from the VERIFIED transactions. That path needs
 * live Sepolia + CC3 Testnet RPC and is exercised by the worker validation
 * scripts.
 *
 * This route implements the demo-mode read path: it resolves the wallet
 * against a set of preset demo borrower profiles (or synthesizes a stable
 * vector for an unknown address) and attaches demo proof artifacts that
 * mirror the real proof shape. Every response sets `demoMode: true` and the
 * UI labels the data as demo — real and simulated data are never blurred.
 */

import { NextResponse } from 'next/server';
import type { CreditCheckRequest, CreditCheckResponse } from '@mira/shared';
import {
  findDemoBorrower,
  syntheticFactorsForAddress,
} from '@/lib/mira/demo-borrowers';
import { buildDemoProofs } from '@/lib/mira/proofs';

const MIN_WALLET_AGE_DAYS = 30;
const MIN_STABLECOIN_VOLUME_90D = 1000;

export async function POST(request: Request) {
  let body: CreditCheckRequest;
  try {
    body = (await request.json()) as CreditCheckRequest;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const walletAddress = body?.walletAddress?.trim();
  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return NextResponse.json(
      { error: 'A valid 0x-prefixed wallet address is required' },
      { status: 400 },
    );
  }

  const demoBorrower = findDemoBorrower(walletAddress);
  const factors = demoBorrower
    ? demoBorrower.factors
    : syntheticFactorsForAddress(walletAddress);
  const evidenceTxHashes = demoBorrower?.evidenceTxHashes ?? [];

  const proofs = buildDemoProofs(factors, evidenceTxHashes);
  const proofTxHashes = proofs.map((p) => p.cc3VerificationTxHash);

  // A wallet is "verified" only if it has enough activity to underwrite.
  // This mirrors the hard-decline rules in the agent + Policy contract.
  const verified =
    factors.walletAgeDays >= MIN_WALLET_AGE_DAYS &&
    factors.stablecoinVolume90d >= MIN_STABLECOIN_VOLUME_90D;

  const response: CreditCheckResponse = {
    verified,
    factors,
    proofTxHashes,
    demoMode: true,
  };

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
