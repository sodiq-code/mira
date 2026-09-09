/**
 * Centralized configuration for the MIRA worker.
 *
 * All runtime values are sourced from environment variables so that the same
 * code runs locally, in preview, and in production without changes. A single
 * {@link loadWorkerConfig} entry point validates the required inputs and throws
 * a descriptive error when a value is missing — failing fast at startup is far
 * cheaper than failing mid-way through a loan decision.
 */

/** Public Creditcoin CC3 Testnet RPC (no auth required). */
export const DEFAULT_CC3_TESTNET_RPC = 'https://rpc.cc3-testnet.creditcoin.network';

/** Gluwa-hosted proof builder service for CC3 Testnet. */
export const DEFAULT_PROOF_BUILDER_URL = 'https://prover.cc3-testnet.creditcoin.network';

/** Public Ethereum Sepolia RPC used to read borrower activity. */
export const DEFAULT_SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

/**
 * Precompile addresses on Creditcoin CC3 Testnet. These are protocol-defined
 * constants — they never change for a given chain instance, so they are safe
 * to hard-code (the SDK exposes the same defaults).
 */
export const BLOCK_PROVER_PRECOMPILE_ADDRESS = '0x0000000000000000000000000000000000000FD2';
export const CHAIN_INFO_PRECOMPILE_ADDRESS = '0x0000000000000000000000000000000000000fd3';

export interface WorkerConfig {
  /** Creditcoin CC3 Testnet JSON-RPC endpoint. */
  creditcoinRpcUrl: string;
  /** Ethereum Sepolia JSON-RPC endpoint. */
  sepoliaRpcUrl: string;
  /** Gluwa proof builder base URL. */
  proofBuilderUrl: string;
  /**
   * Source chain key for Ethereum Sepolia on Creditcoin. Left optional because
   * the worker auto-detects it from the ChainInfo precompile at startup; it can
   * be pinned via env to skip detection.
   */
  sepoliaChainKey?: number;
  /** Optional funded CC3 wallet key — only needed for on-chain emit operations. */
  creditcoinPrivateKey?: string;
  /** Optional pre-selected Sepolia tx hash for validation. */
  sepoliaTxHash?: string;
  /** When true, the on-chain emit step (which costs gas) is skipped. */
  skipOnchainEmit: boolean;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Resolve and validate the worker configuration from the environment.
 *
 * Throws when a value that has no safe default is missing, so misconfiguration
 * is surfaced immediately rather than producing a silent bad decision later.
 */
export function loadWorkerConfig(): WorkerConfig {
  const creditcoinRpcUrl = env('CREDITCOIN_RPC_URL') ?? DEFAULT_CC3_TESTNET_RPC;
  const sepoliaRpcUrl = env('SEPOLIA_RPC_URL') ?? DEFAULT_SEPOLIA_RPC;
  const proofBuilderUrl = env('CREDITCOIN_PROOF_BUILDER_URL') ?? DEFAULT_PROOF_BUILDER_URL;

  const sepoliaChainKeyRaw = env('SOURCE_CHAIN_KEY');
  const sepoliaChainKey = sepoliaChainKeyRaw ? Number(sepoliaChainKeyRaw) : undefined;
  if (sepoliaChainKey !== undefined && !Number.isInteger(sepoliaChainKey)) {
    throw new Error(`SOURCE_CHAIN_KEY must be an integer, received: ${sepoliaChainKeyRaw}`);
  }

  const creditcoinPrivateKey = env('CREDITCOIN_PRIVATE_KEY');
  const skipOnchainEmit = env('SKIP_ONCHAIN_EMIT') === '1' || creditcoinPrivateKey === undefined;

  if (!skipOnchainEmit && creditcoinPrivateKey === undefined) {
    // Defensive: the line above already forces skip when the key is absent, but
    // keep an explicit guard so future edits cannot silently enable emit.
    throw new Error('CREDITCOIN_PRIVATE_KEY is required when SKIP_ONCHAIN_EMIT is not set');
  }

  return {
    creditcoinRpcUrl,
    sepoliaRpcUrl,
    proofBuilderUrl,
    sepoliaChainKey,
    creditcoinPrivateKey,
    sepoliaTxHash: env('SOURCE_CHAIN_TXN_HASH'),
    skipOnchainEmit,
  };
}
