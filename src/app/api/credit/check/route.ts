/**
 * POST /api/credit/check
 *
 * Returns the Attestcoin-verified feature vector for a borrower wallet.
 *
 * ── The real verification path (S3 fix) ──────────────────────────────
 * When `MIRA_REAL_CREDIT_CHECK=1` is set, this route calls the worker's
 * `runCreditCheck` (packages/worker/src/credit-check.ts), which:
 *   1. Fetches the wallet's Sepolia transactions.
 *   2. Generates an Attestcoin inclusion proof for each (hosted ProofBuilder,
 *      with a RawProofBuilder fallback).
 *   3. Verifies each proof against the Creditcoin BlockProver precompile via
 *      a gasless `eth_call` (`verifySingle`).
 *   4. Computes the factors (walletAgeDays, txCount90d, stablecoinVolume90d,
 *      defiPositionCount, prior MIRA history) from the VERIFIED transactions.
 *
 * Every factor is then backed by a real proof the chain checked — not a
 * worker assertion. This is the load-bearing property: a borrower cannot
 * claim activity they did not produce.
 *
 * ── Why the route is env-gated ────────────────────────────────────────
 * `runCreditCheck` is slow (Sepolia block scan + N proof round-trips,
 * ~10–60s). On Vercel serverless the function timeout is bounded, and public
 * RPCs rate-limit. So the real path is opt-in:
 *   - `MIRA_REAL_CREDIT_CHECK=1`  → attempt real verification (with a
 *                                    timeout + graceful fallback to the
 *                                    preset/synthetic path on failure).
 *   - unset / `0`                 → preset/synthetic path only (the
 *                                    historical demo behavior).
 *
 * ── Caching ───────────────────────────────────────────────────────────
 * Successful real-verification results are cached in-process for 5 minutes
 * per wallet (module-level Map). Vercel warm instances reuse the cache; cold
 * starts re-verify. The cache is keyed by wallet address and stores the
 * full CreditCheckResult so subsequent renders of the verified-factors
 * screen are instant.
 *
 * ── Fallback ──────────────────────────────────────────────────────────
 * If the real path fails (RPC down, timeout, 0 verified txs, the wallet is
 * brand new with no activity), the route falls back to the preset/synthetic
 * path and sets `verificationSource: 'fallback'` + `fallbackReason` so the
 * UI can label it honestly. The verified demo wallet (0xB47Ba…) always
 * returns its preset-verified real data (verificationSource:
 * 'preset-verified') — that data came from an actual prior credit-check run.
 *
 * Categories are never blurred — the `verificationSource` field tells the UI
 * exactly which path produced the factors.
 */

import { NextResponse } from 'next/server';
import type { CreditCheckRequest, CreditCheckResponse } from '@mira/shared';
import {
  findDemoBorrower,
  syntheticFactorsForAddress,
} from '@/lib/mira/demo-borrowers';
import { buildDemoProofs } from '@/lib/mira/proofs';

// ── Runtime config ────────────────────────────────────────────────────

const MIN_WALLET_AGE_DAYS = 30;
const MIN_STABLECOIN_VOLUME_90D = 1000;

/**
 * Master switch for the real Attestcoin verification path. When unset/0,
 * the route uses only the preset/synthetic path (the historical demo
 * behavior). When `1`, the route attempts real verification with a timeout
 * and graceful fallback.
 */
const REAL_CREDIT_CHECK_ENABLED = process.env.MIRA_REAL_CREDIT_CHECK === '1';

/**
 * Hard timeout for the real verification path. If runCreditCheck does not
 * complete within this window, the route falls back to the preset/synthetic
 * path with `verificationSource: 'fallback'`. Defaults to 40s — generous
 * enough for a hosted-proof round-trip on a handful of txs, bounded enough
 * to fit within Vercel's default function timeout.
 */
const REAL_CHECK_TIMEOUT_MS = Number(process.env.MIRA_REAL_CHECK_TIMEOUT_MS ?? 40_000);

/**
 * Cache TTL for successful real-verification results. 5 minutes balances
 * freshness (the wallet's activity may change) against RPC load.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

// ── In-process cache ──────────────────────────────────────────────────

interface CacheEntry {
  result: CreditCheckResponse;
  expiresAt: number;
}

/**
 * Module-level cache. Survives across requests in a warm serverless
 * instance; cold starts re-verify. Keyed by lowercase wallet address.
 */
const realCheckCache = new Map<string, CacheEntry>();

function getCached(wallet: string): CreditCheckResponse | null {
  const entry = realCheckCache.get(wallet.toLowerCase());
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    realCheckCache.delete(wallet.toLowerCase());
    return null;
  }
  return entry.result;
}

function setCached(wallet: string, result: CreditCheckResponse): void {
  realCheckCache.set(wallet.toLowerCase(), {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ── Preset / synthetic path (the historical behavior) ─────────────────

function buildPresetResponse(walletAddress: string): CreditCheckResponse {
  const demoBorrower = findDemoBorrower(walletAddress);
  const factors = demoBorrower
    ? demoBorrower.factors
    : syntheticFactorsForAddress(walletAddress);
  const evidenceTxHashes = demoBorrower?.evidenceTxHashes ?? [];
  const proofs = buildDemoProofs(factors, evidenceTxHashes);
  const proofTxHashes = proofs.map((p) => p.cc3VerificationTxHash);

  const verified =
    (factors.walletAgeDays >= MIN_WALLET_AGE_DAYS ||
      demoBorrower?.realVerification) &&
    factors.stablecoinVolume90d >= MIN_STABLECOIN_VOLUME_90D;

  return {
    verified: Boolean(verified),
    factors,
    proofTxHashes,
    demoMode: !demoBorrower?.realVerification,
    verificationSource: demoBorrower?.realVerification
      ? 'preset-verified'
      : 'synthetic',
  };
}

// ── Real verification path (S3 fix) ───────────────────────────────────

/**
 * Run the real Attestcoin credit check with a hard timeout.
 *
 * Resolves to a CreditCheckResponse on success, or throws on
 * timeout/failure (the caller catches and falls back).
 */
async function runRealCreditCheck(
  walletAddress: string,
): Promise<CreditCheckResponse> {
  // Dynamic import keeps @gluwa/usc-sdk (a Node-only dependency) out of the
  // client bundle and out of cold-start when the real path is disabled.
  const { createCreditChecker } = await import('@mira/worker');

  const creditcoinRpcUrl =
    process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
  const sepoliaRpcUrl =
    process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
  const proofBuilderUrl =
    process.env.CREDITCOIN_PROOF_BUILDER_URL ??
    'https://prover.cc3-testnet.creditcoin.network';
  const borrowerReputationAddress = process.env.BORROWER_REPUTATION_ADDRESS;

  const sepoliaChainKeyRaw = process.env.SOURCE_CHAIN_KEY;
  const sepoliaChainKey = sepoliaChainKeyRaw
    ? Number(sepoliaChainKeyRaw)
    : undefined;

  const { check } = createCreditChecker({
    creditcoinRpcUrl,
    sepoliaRpcUrl,
    proofBuilderUrl,
    sepoliaChainKey,
    borrowerReputationAddress,
    // Cap the proof attempts so a busy wallet doesn't blow the timeout.
    // The hosted ProofBuilder is fast (~1s/proof), so 10 is ~10s worst case.
    maxTxsToProve: 10,
    // Keep the block-scan range modest — public Sepolia RPCs rate-limit.
    maxBlockScanRange: 5_000,
  });

  // Race the check against a hard timeout. Aborting the loser is fine —
  // the worker's RPC calls are best-effort and the process continues.
  const result = await Promise.race([
    check(walletAddress),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Real credit check timed out after ${REAL_CHECK_TIMEOUT_MS}ms`)),
        REAL_CHECK_TIMEOUT_MS,
      ),
    ),
  ]);

  if (!result.verified) {
    // The worker ran but the wallet has insufficient verified activity.
    // This is a legitimate "decline" outcome — return it honestly with the
    // real (zeroed) factors. We MUST NOT fall back to synthetic factors here:
    // doing so would blur real and simulated data (a declined wallet would
    // silently become an approved one). The catch block below only handles
    // genuine errors/timeouts, not legitimate declines.
    return {
      verified: false,
      factors: result.factors,
      proofTxHashes: result.proofTxHashes,
      demoMode: false,
      verificationSource: 'attestcoin' as const,
      scannedTxCount: result.scannedTxCount,
      verifiedTxCount: result.verifiedTxCount,
      proofErrorCount: result.proofErrorCount,
    };
  }

  const response: CreditCheckResponse = {
    verified: true,
    factors: result.factors,
    proofTxHashes: result.proofTxHashes,
    demoMode: false,
    verificationSource: 'attestcoin',
    scannedTxCount: result.scannedTxCount,
    verifiedTxCount: result.verifiedTxCount,
    proofErrorCount: result.proofErrorCount,
  };
  return response;
}

// ── Route handler ─────────────────────────────────────────────────────

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

  // ── 1. Preset-verified wallet fast path ────────────────────────────
  // The known verified demo wallet (0xB47Ba…) has real Attestcoin-verified
  // data from an actual prior credit-check run (the worker scripts). Serve
  // it instantly with verificationSource: 'preset-verified' so the UI
  // labels it as real, verified data — not synthetic.
  const demoBorrower = findDemoBorrower(walletAddress);
  if (demoBorrower?.realVerification) {
    const preset = buildPresetResponse(walletAddress);
    return NextResponse.json(preset, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // ── 2. Real verification path (env-gated) ──────────────────────────
  if (REAL_CREDIT_CHECK_ENABLED) {
    // Serve from cache if a recent real check succeeded.
    const cached = getCached(walletAddress);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    try {
      const realResult = await runRealCreditCheck(walletAddress);
      setCached(walletAddress, realResult);
      return NextResponse.json(realResult, {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (err) {
      // Graceful fallback: the real path failed or timed out. Return the
      // preset/synthetic vector with verificationSource: 'fallback' so the
      // UI can label it honestly and surface the reason.
      const fallback = buildPresetResponse(walletAddress);
      const fallbackReason = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        {
          ...fallback,
          verificationSource: 'fallback' as const,
          fallbackReason,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
  }

  // ── 3. Default: preset/synthetic path (historical demo behavior) ───
  const preset = buildPresetResponse(walletAddress);
  return NextResponse.json(preset, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

// ── Vercel function config ────────────────────────────────────────────
// Allow up to 60s for the real verification path (Pro plan). The
// REAL_CHECK_TIMEOUT_MS guard above ensures we never actually block this
// long — we fall back first.
export const maxDuration = 60;
export const runtime = 'nodejs';
