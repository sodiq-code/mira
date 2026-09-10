/**
 * Credit-check: extract a verified feature vector from a borrower's Ethereum
 * Sepolia wallet activity.
 *
 * This is the core read path that turns "trust me, I have on-chain history"
 * into "here is a cryptographically-verified feature vector the agent can
 * underwrite against." Every factor fed into the LLM decision comes from a
 * Sepolia transaction that was proven via Attestcoin and verified by the
 * Creditcoin BlockProver precompile — nothing about the borrower is taken on
 * faith.
 *
 * The flow:
 *   1. Fetch the wallet's recent Sepolia transactions via `getHistory`.
 *   2. For each (capped) tx, generate an Attestcoin proof and verify it with
 *      `client.verifyReadonly(proof)` (gasless `eth_call` against the
 *      BlockProver precompile).
 *   3. From the VERIFIED txs, compute:
 *        - walletAgeDays           days since the wallet's first verified tx
 *        - txCount90d              verified txs in the last 90 days
 *        - stablecoinVolume90d     USD value moved to/from known stablecoins
 *                                  (USDC, USDT, DAI on Sepolia) in the last
 *                                  90 days, parsed from ERC-20 Transfer logs
 *        - defiPositionCount       distinct contracts the wallet touched
 *                                  (proxy for DeFi breadth)
 *   4. Optionally read prior MIRA loan history from the deployed
 *      BorrowerReputation contract (loanCount, repaidCount, defaultedCount).
 *   5. Return the feature vector plus the proof tx hashes as evidence.
 *
 * If the wallet has no Sepolia activity — or no tx could be verified — the
 * result is `verified: false` with a reason, so the agent can decline without
 * inventing factors.
 */

import {
  Contract,
  JsonRpcProvider,
  type InterfaceAbi,
  type TransactionResponse,
  type TransactionReceipt,
} from 'ethers';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAttestcoinClient, type AttestcoinClient } from './attestcoin';
import type {
  CreditCheckResponse,
  VerifiedFactors,
} from '@mira/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = join(__dirname, '..', '..', 'contracts', 'artifacts', 'contracts');

function loadArtifactAbi(name: string): InterfaceAbi {
  const path = join(ARTIFACTS_DIR, `${name}.sol`, `${name}.json`);
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as { abi?: InterfaceAbi; contractAbi?: InterfaceAbi };
  const abi = parsed.abi ?? parsed.contractAbi;
  if (!abi) {
    throw new Error(`Artifact ${name} at ${path} has no ABI`);
  }
  return abi;
}

/**
 * Known stablecoin contracts on Sepolia.
 *
 * Sepolia stablecoins are test tokens with no real value, but their transfer
 * volume is a useful behavioral signal: a wallet that has actively moved
 * stablecoins is more likely to be a real DeFi user than a freshly created
 * Sybil. The set is intentionally small and hardcoded — these are the
 * addresses the worker treats as "stablecoin" for volume accounting.
 *
 * Decimals matter because ERC-20 amounts are in the smallest unit; dividing
 * by 10^decimals yields the human-readable USD-denominated amount.
 *
 * Design note: MIRA uses real Sepolia ERC-20 Transfer events rather than
 * Aave V3 Repay events because Aave V3 is not officially deployed on
 * Sepolia. The cryptographic guarantee is identical — both are real,
 * attested Sepolia transactions proven via Attestcoin and verified by the
 * BlockProver precompile. The semantic difference (Repay is a stronger
 * repayment-behavior signal) is a modeling choice, not a trust choice. On
 * mainnet, this set would be extended to include the Aave V3 pool address
 * and the log parser would decode Repay events. See
 * docs/attestcoin-integration.md for the full equivalence argument.
 */
export interface StablecoinSpec {
  symbol: 'USDC' | 'USDT' | 'DAI';
  address: string;
  decimals: number;
}

export const SEPOLIA_STABLECOINS: readonly StablecoinSpec[] = [
  {
    symbol: 'USDC',
    // Native USDC on Sepolia (Circle's test deployment).
    address: '0x1c7D4B196Cb0C7B01e74350c61ab9302914A2033',
    decimals: 6,
  },
  {
    symbol: 'USDT',
    // Multichain-bridged USDT on Sepolia.
    address: '0x7169D38820A1175FB0235BD6eE9357E67B35E1be',
    decimals: 6,
  },
  {
    symbol: 'DAI',
    // Multichain-bridged DAI on Sepolia.
    address: '0xb4f7DD56612eE4893AD5A3FA3d06dC3BcEA1BA3C',
    decimals: 18,
  },
  {
    symbol: 'USDC',
    // MIRA-deployed MockUSDC on Sepolia — used to create real testnet
    // financial activity (token transfers) that Attestcoin can verify.
    // On mainnet this would be the real USDC address.
    address: '0x7fAb1E37d992109d3aA747703436ff4e261391b7',
    decimals: 6,
  },
];

/**
 * keccak256("Transfer(address,address,uint256)")
 *
 * The canonical ERC-20 Transfer event topic. Used to identify Transfer logs
 * when parsing stablecoin volume from transaction receipts.
 */
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** 90 days, in seconds. */
const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;

/** Maximum number of txs to attempt Attestcoin proofs for. */
const DEFAULT_MAX_TXS_TO_PROVE = 20;

/**
 * Default block-scan range for the wallet-history fallback.
 *
 * ethers v6 removed `JsonRpcProvider.getHistory` (it was a v5 method that
 * relied on a now-deprecated Etherscan-style API). When the runtime provider
 * does not expose `getHistory`, we scan this many recent blocks for txs where
 * `from` or `to` matches the wallet. Sepolia has ~12s blocks, so 10,000
 * blocks ≈ 33 hours of activity — enough to spot a recently-active wallet
 * without hammering the public RPC.
 */
const DEFAULT_MAX_BLOCK_SCAN_RANGE = 10_000;

/**
 * Concurrency for block scanning. Public Sepolia RPCs rate-limit aggressively,
 * so we keep this modest.
 */
const BLOCK_SCAN_CONCURRENCY = 5;

/**
 * The richer internal result type.
 *
 * Extends the shared {@link CreditCheckResponse} with diagnostic fields the
 * worker uses for logging and the agent prompt (proof tx count, scan count,
 * and a human-readable reason when verification fails). The shared type is
 * the public API boundary; this is the internal shape.
 */
export interface CreditCheckResult extends CreditCheckResponse {
  /** Populated when `verified` is false; explains why. */
  reason?: string;
  /** Number of Sepolia txs discovered for the wallet (before proving). */
  scannedTxCount: number;
  /** Number of Sepolia txs that passed Attestcoin verification. */
  verifiedTxCount: number;
  /** Number of txs for which a proof was attempted. */
  attemptedProofCount: number;
  /** Number of proof attempts that errored out (vs. returned false). */
  proofErrorCount: number;
}

export interface CreditCheckOptions {
  /** The borrower wallet address to underwrite. */
  walletAddress: string;
  /** The Attestcoin client (provides Sepolia provider + proof generation). */
  attestcoinClient: AttestcoinClient;
  /**
   * Optional BorrowerReputation contract address on Creditcoin. When
   * provided, the prior MIRA loan counts are read gaslessly and folded into
   * the feature vector. When omitted, the prior-counts fields are zeroed.
   */
  borrowerReputationAddress?: string;
  /**
   * The Creditcoin JSON-RPC provider (for the BorrowerReputation read).
   * Required iff `borrowerReputationAddress` is set.
   */
  creditcoinProvider?: JsonRpcProvider;
  /**
   * Cap on the number of recent txs to attempt Attestcoin proofs for.
   * Defaults to 20 — each proof is a hosted round-trip, and proving more
   * than ~20 recent txs is rarely informative for a credit signal.
   */
  maxTxsToProve?: number;
  /**
   * Cap on the number of recent blocks to scan when the runtime provider
   * does not expose `getHistory` (ethers v6 JsonRpcProvider does not).
   * Defaults to 10,000. Ignored when the provider exposes `getHistory`.
   */
  maxBlockScanRange?: number;
  /**
   * Pre-discovered Sepolia transaction hashes to verify via Attestcoin,
   * bypassing the slow block-scan fallback. In production, callers should
   * use an indexed API (Etherscan, Alchemy Transfers, The Graph) to
   * discover the wallet's recent transactions and pass them here — the
   * trust is in the Attestcoin verification, not in how the transactions
   * were discovered. When omitted, the function falls back to block
   * scanning.
   */
  knownTxHashes?: string[];
}

/**
 * Build a `verified: false` result with a reason and zeroed factors.
 *
 * The shared API contract requires `factors` to always be present (the agent
 * prompt expects the shape), so even on failure we return a zeroed vector.
 */
function insufficientActivity(reason: string): CreditCheckResult {
  return {
    verified: false,
    reason,
    factors: {
      walletAgeDays: 0,
      txCount90d: 0,
      stablecoinVolume90d: 0,
      defiPositionCount: 0,
      priorMiraLoans: 0,
      priorMiraRepaid: 0,
      priorMiraDefaulted: 0,
    },
    proofTxHashes: [],
    demoMode: false,
    scannedTxCount: 0,
    verifiedTxCount: 0,
    attemptedProofCount: 0,
    proofErrorCount: 0,
  };
}

/** Normalize an Ethereum address to lowercase for set/map comparisons. */
function lower(addr: string | undefined | null): string | null {
  if (!addr) return null;
  return addr.toLowerCase();
}

/**
 * Fetch the wallet's Sepolia transaction history.
 *
 * ethers v6 removed `JsonRpcProvider.getHistory` (it was a v5 method backed
 * by an Etherscan-style API). To stay portable across providers, we:
 *   1. Try the runtime `getHistory` if the provider exposes one (e.g. a
 *      custom subclass or an EtherscanProvider). This is a defensive cast
 *      because the public type does not declare it.
 *   2. Fall back to scanning the most recent `maxBlockScanRange` blocks and
 *      filtering by `from`/`to` matching the wallet. This is O(blocks) but
 *      avoids any third-party API dependency.
 *
 * For production throughput, callers should swap in an indexed provider
 * (Etherscan API, The Graph, Alchemy Transfers) — the function signature is
 * designed to accept any provider that exposes either path.
 */
async function fetchWalletHistory(
  provider: JsonRpcProvider,
  wallet: string,
  maxBlockScanRange: number,
): Promise<TransactionResponse[]> {
  // Defensive: some providers (EtherscanProvider, custom subclasses) still
  // expose getHistory. Use it if present — it is far faster than scanning.
  const getHistory = (
    provider as unknown as {
      getHistory?: (addr: string) => Promise<TransactionResponse[]>;
    }
  ).getHistory;
  if (typeof getHistory === 'function') {
    return getHistory.call(provider, wallet);
  }

  // Fallback: scan recent blocks for txs involving the wallet.
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - maxBlockScanRange + 1);
  const walletLower = wallet.toLowerCase();
  const found: TransactionResponse[] = [];
  const seenHashes = new Set<string>();

  // Scan in descending order (most recent first) so we find recent activity
  // fast — and stop early once we have plenty of candidates.
  const blockNumbers: number[] = [];
  for (let bn = latest; bn >= fromBlock; bn--) {
    blockNumbers.push(bn);
  }

  // Process blocks in batches of BLOCK_SCAN_CONCURRENCY to respect RPC
  // rate limits while keeping throughput reasonable.
  for (let i = 0; i < blockNumbers.length; i += BLOCK_SCAN_CONCURRENCY) {
    const batch = blockNumbers.slice(i, i + BLOCK_SCAN_CONCURRENCY);
    const blocks = await Promise.all(
      batch.map(async (bn) => {
        try {
          // `true` requests the block with full transaction objects.
          return await provider.getBlock(bn, true);
        } catch {
          return null;
        }
      }),
    );
    for (const block of blocks) {
      if (!block || !block.prefetchedTransactions) continue;
      for (const tx of block.prefetchedTransactions) {
        const from = tx.from?.toLowerCase();
        const to = tx.to?.toLowerCase();
        if (from !== walletLower && to !== walletLower) continue;
        if (!tx.hash || seenHashes.has(tx.hash)) continue;
        seenHashes.add(tx.hash);
        found.push(tx);
      }
    }
    // Early-exit: we have more than enough candidates to prove.
    if (found.length >= DEFAULT_MAX_TXS_TO_PROVE * 2) break;
  }

  return found;
}

/** Address → spec lookup for the Sepolia stablecoin set (case-insensitive). */
function lookupStablecoin(addr: string): StablecoinSpec | undefined {
  const target = addr.toLowerCase();
  return SEPOLIA_STABLECOINS.find((s) => s.address.toLowerCase() === target);
}

/**
 * Extract a 32-byte address from an indexed topic (topics are 32 bytes,
 * addresses are right-padded with zeros — the address is the last 20 bytes).
 */
function addressFromTopic(topic: string): string {
  return '0x' + topic.slice(26);
}

/**
 * Run a credit check against a Sepolia wallet.
 *
 * @see {@link CreditCheckOptions} for the inputs.
 * @see {@link CreditCheckResult} for the outputs.
 */
export async function runCreditCheck(
  opts: CreditCheckOptions,
): Promise<CreditCheckResult> {
  const wallet = opts.walletAddress;
  if (!wallet || !wallet.startsWith('0x') || wallet.length !== 42) {
    return insufficientActivity(`Invalid wallet address: ${wallet}`);
  }

  const attestcoin = opts.attestcoinClient;
  const sepolia = attestcoin.sepoliaProvider;

  // 1. Resolve the Sepolia chain key on Creditcoin (used for proof generation).
  let chainKey: number;
  try {
    const chain = await attestcoin.resolveSepoliaChainKey();
    chainKey = chain.chainKey;
  } catch (err) {
    return insufficientActivity(
      `Could not resolve Sepolia chain key on Creditcoin: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // 2. Fetch the wallet's Sepolia transaction history.
  let history: TransactionResponse[];
  try {
    if (opts.knownTxHashes && opts.knownTxHashes.length > 0) {
      // Fast path: caller has pre-discovered transaction hashes (e.g. via
      // Etherscan API or Alchemy Transfers). Fetch each one by hash — far
      // faster than scanning blocks, and the trust is in the Attestcoin
      // verification that follows, not in how the txs were discovered.
      history = [];
      for (const hash of opts.knownTxHashes) {
        try {
          const tx = await sepolia.getTransaction(hash);
          if (tx) history.push(tx);
        } catch {
          // Skip txs that can't be fetched (e.g. not yet mined).
        }
      }
    } else {
      history = await fetchWalletHistory(
        sepolia,
        wallet,
        opts.maxBlockScanRange ?? DEFAULT_MAX_BLOCK_SCAN_RANGE,
      );
    }
  } catch (err) {
    return insufficientActivity(
      `Failed to fetch Sepolia tx history for ${wallet}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!history || history.length === 0) {
    return insufficientActivity(
      `Insufficient verified activity: no Sepolia transactions found for ${wallet}`,
    );
  }

  // 3. Sort by block descending, then cap to the most recent N for proving.
  const sorted = [...history].sort((a, b) => {
    const aBn = a.blockNumber ?? 0;
    const bBn = b.blockNumber ?? 0;
    return bBn - aBn;
  });
  const cap = opts.maxTxsToProve ?? DEFAULT_MAX_TXS_TO_PROVE;
  const toProve = sorted.slice(0, cap);

  // 4. Generate + verify an Attestcoin proof for each candidate tx.
  const verifiedTxs: TransactionResponse[] = [];
  const proofTxHashes: string[] = [];
  let proofErrorCount = 0;

  for (const tx of toProve) {
    if (!tx.hash) continue;
    try {
      const proof = await attestcoin.generateProof(chainKey, tx.hash);
      const ok = await attestcoin.verifyReadonly(proof);
      if (ok) {
        verifiedTxs.push(tx);
        proofTxHashes.push(tx.hash);
      }
    } catch {
      // Proof generation or verification threw — count and move on. This is
      // expected for some txs (e.g. very recent ones not yet attested on
      // Creditcoin, or txs the hosted prover has not indexed).
      proofErrorCount += 1;
    }
  }

  if (verifiedTxs.length === 0) {
    return {
      ...insufficientActivity(
        `Insufficient verified activity: 0 of ${toProve.length} Sepolia txs ` +
          `passed Attestcoin verification for ${wallet}`,
      ),
      scannedTxCount: history.length,
      attemptedProofCount: toProve.length,
      proofErrorCount,
    };
  }

  // 5. Fetch block timestamps for every unique block among verified txs.
  //    ethers' getBlock returns the timestamp; we cache per-block to avoid
  //    refetching for txs that share a block.
  const uniqueBlockNumbers = Array.from(
    new Set(
      verifiedTxs
        .map((t) => t.blockNumber)
        .filter((n): n is number => typeof n === 'number'),
    ),
  );
  const blockTimestamps = new Map<number, number>();
  for (const blockNum of uniqueBlockNumbers) {
    try {
      const block = await sepolia.getBlock(blockNum);
      if (block && typeof block.timestamp === 'number') {
        blockTimestamps.set(blockNum, block.timestamp);
      }
    } catch {
      // Best-effort: skip blocks we can't fetch.
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const ninetyDaysAgoSec = nowSec - NINETY_DAYS_SECONDS;

  // 6. walletAgeDays: days since the OLDEST verified tx's block.
  let oldestTs = nowSec;
  for (const tx of verifiedTxs) {
    const ts = tx.blockNumber ? blockTimestamps.get(tx.blockNumber) : undefined;
    if (typeof ts === 'number' && ts < oldestTs) {
      oldestTs = ts;
    }
  }
  const walletAgeDays = Math.max(0, Math.floor((nowSec - oldestTs) / 86400));

  // 7. txCount90d: verified txs whose block timestamp is within 90 days.
  const recentVerifiedTxs = verifiedTxs.filter((tx) => {
    const ts = tx.blockNumber ? blockTimestamps.get(tx.blockNumber) : undefined;
    return typeof ts === 'number' && ts >= ninetyDaysAgoSec;
  });
  const txCount90d = recentVerifiedTxs.length;

  // 8. stablecoinVolume90d: sum of ERC-20 Transfer amounts (in USD) for the
  //    wallet, across the known stablecoin contracts, within the last 90
  //    days. Requires fetching receipts for stablecoin-interacting txs and
  //    parsing Transfer logs.
  let stablecoinVolume90d = 0;
  const stablecoinWalletTxs = recentVerifiedTxs.filter((tx) => {
    const to = lower(tx.to);
    return to !== null && lookupStablecoin(to) !== undefined;
  });

  for (const tx of stablecoinWalletTxs) {
    let receipt: TransactionReceipt | null;
    try {
      receipt = await sepolia.getTransactionReceipt(tx.hash);
    } catch {
      continue;
    }
    if (!receipt) continue;
    const stablecoin = lookupStablecoin(tx.to as string);
    if (!stablecoin) continue;

    const stablecoinAddrLower = stablecoin.address.toLowerCase();
    const walletLower = wallet.toLowerCase();

    for (const log of receipt.logs) {
      // Must be a Transfer event emitted by the stablecoin contract.
      if (!log.topics || log.topics.length < 3) continue;
      if (log.topics[0] !== TRANSFER_TOPIC) continue;
      if (log.address.toLowerCase() !== stablecoinAddrLower) continue;

      const from = addressFromTopic(log.topics[1]).toLowerCase();
      const to = addressFromTopic(log.topics[2]).toLowerCase();
      // Only count transfers where the wallet is sender OR recipient.
      if (from !== walletLower && to !== walletLower) continue;

      // The amount is the (non-indexed) data field, ABI-encoded as uint256.
      try {
        const amount = BigInt(log.data);
        // Convert from smallest unit to USD using the stablecoin's decimals.
        stablecoinVolume90d += Number(amount) / Math.pow(10, stablecoin.decimals);
      } catch {
        // Malformed data — skip this log.
      }
    }
  }

  // 9. defiPositionCount: distinct non-zero contract addresses the wallet
  //    interacted with across all verified txs. A proxy for DeFi breadth —
  //    more distinct contracts suggests more diverse on-chain activity.
  const distinctContracts = new Set<string>();
  for (const tx of verifiedTxs) {
    const to = lower(tx.to);
    if (to && to !== '0x0000000000000000000000000000000000000000') {
      distinctContracts.add(to);
    }
  }
  const defiPositionCount = distinctContracts.size;

  // 10. Optional: read prior MIRA loan history from BorrowerReputation.
  let priorMiraLoans = 0;
  let priorMiraRepaid = 0;
  let priorMiraDefaulted = 0;
  if (opts.borrowerReputationAddress && opts.creditcoinProvider) {
    try {
      const abi = loadArtifactAbi('BorrowerReputation');
      const contract = new Contract(
        opts.borrowerReputationAddress,
        abi,
        opts.creditcoinProvider,
      );
      // getFullReputation returns (loanCount, repaidCount, defaultedCount,
      // firstLoanBlock, exists) — all uint256 except the last bool.
      const result = (await contract.getFullReputation.staticCall(wallet)) as {
        loanCount: bigint;
        repaidCount: bigint;
        defaultedCount: bigint;
        firstLoanBlock: bigint;
        exists: boolean;
      };
      priorMiraLoans = Number(result.loanCount);
      priorMiraRepaid = Number(result.repaidCount);
      priorMiraDefaulted = Number(result.defaultedCount);
    } catch {
      // Best-effort: leave prior counts at zero if the read fails (e.g.
      // contract not yet deployed, or borrower has no record).
    }
  }

  const factors: VerifiedFactors = {
    walletAgeDays,
    txCount90d,
    stablecoinVolume90d,
    defiPositionCount,
    priorMiraLoans,
    priorMiraRepaid,
    priorMiraDefaulted,
  };

  return {
    verified: true,
    factors,
    proofTxHashes,
    demoMode: false,
    scannedTxCount: history.length,
    verifiedTxCount: verifiedTxs.length,
    attemptedProofCount: toProve.length,
    proofErrorCount,
  };
}

/**
 * Convenience: build a credit-check callable from a worker config + optional
 * BorrowerReputation address.
 *
 * Wraps {@link runCreditCheck} with an Attestcoin client constructed from the
 * provided Creditcoin / Sepolia RPC URLs. Useful for one-shot callers (e.g.
 * API routes) that don't want to manage the Attestcoin client lifecycle.
 */
export function createCreditChecker(opts: {
  creditcoinRpcUrl: string;
  sepoliaRpcUrl: string;
  proofBuilderUrl: string;
  sepoliaChainKey?: number;
  borrowerReputationAddress?: string;
  maxTxsToProve?: number;
  maxBlockScanRange?: number;
}): {
  check: (walletAddress: string) => Promise<CreditCheckResult>;
  attestcoinClient: AttestcoinClient;
} {
  const attestcoinClient = createAttestcoinClient({
    creditcoinRpcUrl: opts.creditcoinRpcUrl,
    sepoliaRpcUrl: opts.sepoliaRpcUrl,
    proofBuilderUrl: opts.proofBuilderUrl,
    sepoliaChainKey: opts.sepoliaChainKey,
    skipOnchainEmit: true,
  });

  const creditcoinProvider = attestcoinClient.creditcoinProvider;

  return {
    attestcoinClient,
    check: (walletAddress: string) =>
      runCreditCheck({
        walletAddress,
        attestcoinClient,
        borrowerReputationAddress: opts.borrowerReputationAddress,
        creditcoinProvider,
        maxTxsToProve: opts.maxTxsToProve,
        maxBlockScanRange: opts.maxBlockScanRange,
      }),
  };
}
