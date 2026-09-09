/**
 * Attestcoin integration layer.
 *
 * Wraps the @gluwa/usc-sdk into a small, typed surface that the rest of the
 * worker (and the agent decisioning loop) can call without knowing the SDK's
 * internals. The two responsibilities exposed here are the only two the
 * product ever needs:
 *
 *   1. Prove that a given Ethereum Sepolia transaction really happened, using
 *      an Attestcoin inclusion proof that is verified by the Creditcoin
 *      BlockProver precompile. This is the cryptographic trust root for every
 *      factor MIRA underwrites against — nothing about a borrower is believed
 *      unless it comes back verified from here.
 *   2. Optionally persist that verification on-chain so it leaves a publicly
 *      inspectable `TransactionVerified` event. This is the writability half
 *      of the protocol and is what separates a read-only demo from a real
 *      Creditcoin application.
 *
 * Design notes:
 *  - Proof generation tries the Gluwa-hosted ProofBuilder first (fast, cached)
 *    and falls back to {@link RawProofBuilder} which computes the proof locally
 *    from Sepolia block data. The fallback exists so the worker keeps working
 *    even if the hosted API is rate-limited or briefly unavailable.
 *  - Read verification uses `verifySingle`, a gasless `eth_call` against the
 *    precompile. It runs the exact same verification logic as a state-changing
 *    transaction, so a `true` result is genuine proof of feasibility without
 *    spending any test-CTC.
 */

import { JsonRpcProvider, Signer, Wallet, ContractTransactionResponse } from 'ethers';
import {
  chainInfo,
  blockProver,
  proofProvider,
  encoding,
} from '@gluwa/usc-sdk';
import {
  BLOCK_PROVER_PRECOMPILE_ADDRESS,
  CHAIN_INFO_PRECOMPILE_ADDRESS,
  type WorkerConfig,
} from './config';

/** A source chain advertised by the Creditcoin ChainInfo precompile. */
export type SupportedChain = {
  chainKey: number;
  chainId: number;
  chainName: string;
  chainEncoding: number;
};

/** Latest attested block for a source chain, as reported by Creditcoin. */
export type AttestedHeight = {
  height: number;
  hash: string;
  isAttestation: boolean;
  exists: boolean;
};

/** A fully-generated Attestcoin proof ready for on-chain verification. */
export type AttestcoinProof = {
  chainKey: number;
  headerNumber: number;
  txIndex: number;
  txHash: string;
  txBytes: string;
  continuityProof: { lowerEndpointDigest: string; roots: string[] };
  merkleProof: { root: string; siblings: { hash: string; isLeft: boolean }[] };
  /** Whether the proof came from the hosted service or the local raw builder. */
  source: 'hosted' | 'raw';
};

/** Structured outcome of a full verify-transaction-inclusion run. */
export type VerificationResult = {
  success: boolean;
  chainKey: number;
  txHash: string;
  headerNumber: number;
  /** Result of the gasless read-only precompile call. */
  readonlyVerification: boolean;
  /** Populated only when an on-chain emit transaction was submitted. */
  onchainTxHash?: string;
  /** Populated only when verification failed. */
  error?: string;
  /** Which proof source produced the proof. */
  proofSource: AttestcoinProof['source'];
};

/**
 * Decode a chain name that the precompile may return either as plain UTF-8 or
 * as a hex-encoded byte string (the CC3 ChainInfo precompile returns the name
 * ABI-encoded as bytes, which the SDK surfaces as a 0x-prefixed hex string).
 */
export function decodeChainName(raw: string): string {
  if (typeof raw !== 'string') return '';
  if (raw.startsWith('0x')) {
    try {
      const hex = raw.slice(2);
      // Map function MUST be the second arg to Uint8Array.from: chaining
      // .map() afterwards would first coerce each hex string to a byte
      // (dropping any pair containing a-f) and then re-parse the wreckage.
      const bytes = Uint8Array.from(hex.match(/.{1,2}/g) ?? [], (b) => parseInt(b, 16));
      return new TextDecoder().decode(bytes).replace(/\u0000+$/, '').trim();
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * Heuristic matcher: locate the Sepolia chain key from the set of chains the
 * Creditcoin precompile currently attests. The key is a Creditcoin-internal
 * identifier (distinct from chainId) and is not guaranteed stable across
 * environments, so we resolve it dynamically rather than hard-coding it.
 */
export function findSepoliaChainKey(chains: SupportedChain[]): SupportedChain | undefined {
  return chains.find((c) => {
    const name = decodeChainName(c.chainName).toLowerCase();
    return name.includes('sepolia') || name.includes('ethereum sepolia');
  });
}

export interface AttestcoinClient {
  /** Creditcoin JSON-RPC provider (CC3 Testnet). */
  readonly creditcoinProvider: JsonRpcProvider;
  /** Ethereum Sepolia JSON-RPC provider. */
  readonly sepoliaProvider: JsonRpcProvider;
  /** List every source chain Creditcoin currently attests. */
  getSupportedChains(): Promise<SupportedChain[]>;
  /** Resolve the Sepolia chain descriptor, throwing if unsupported. */
  resolveSepoliaChainKey(): Promise<SupportedChain>;
  /** Latest Sepolia block that Creditcoin has attested. */
  getLatestAttestedSepoliaHeight(chainKey: number): Promise<AttestedHeight>;
  /** Block until Creditcoin attests the requested Sepolia height. */
  waitForSepoliaAttestation(chainKey: number, height: number): Promise<void>;
  /** Generate an Attestcoin proof for a Sepolia tx (hosted, with raw fallback). */
  generateProof(chainKey: number, txHash: string): Promise<AttestcoinProof>;
  /** Gasless verification via the BlockProver precompile (eth_call). */
  verifyReadonly(proof: AttestcoinProof): Promise<boolean>;
  /** On-chain verification that emits `TransactionVerified` (costs gas). */
  verifyAndEmit(signer: Signer, proof: AttestcoinProof): Promise<ContractTransactionResponse>;
  /** End-to-end: prove + verify a Sepolia tx inclusion on Creditcoin. */
  verifyTransactionInclusion(opts: {
    chainKey: number;
    txHash: string;
    signer?: Signer;
    skipOnchainEmit?: boolean;
  }): Promise<VerificationResult>;
}

export function createAttestcoinClient(config: WorkerConfig): AttestcoinClient {
  const creditcoinProvider = new JsonRpcProvider(config.creditcoinRpcUrl);
  const sepoliaProvider = new JsonRpcProvider(config.sepoliaRpcUrl);

  const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(creditcoinProvider);
  const blockProverInstance = new blockProver.PrecompileBlockProver(creditcoinProvider);

  // Silence the unused-warning while keeping the addresses documented/available:
  void BLOCK_PROVER_PRECOMPILE_ADDRESS;
  void CHAIN_INFO_PRECOMPILE_ADDRESS;

  async function getSupportedChains(): Promise<SupportedChain[]> {
    return (await chainInfoProvider.getSupportedChains()) as SupportedChain[];
  }

  async function resolveSepoliaChainKey(): Promise<SupportedChain> {
    const configured = config.sepoliaChainKey;
    if (configured !== undefined) {
      const all = await getSupportedChains();
      const match = all.find((c) => c.chainKey === configured);
      if (!match) {
        throw new Error(
          `SOURCE_CHAIN_KEY=${configured} is not attested on Creditcoin. Supported: ${all
            .map((c) => `${c.chainKey}:${c.chainName}`)
            .join(', ')}`,
        );
      }
      return match;
    }
    const all = await getSupportedChains();
    const match = findSepoliaChainKey(all);
    if (!match) {
      throw new Error(
        `No Ethereum Sepolia chain found on Creditcoin. Supported: ${all
          .map((c) => `${c.chainKey}:${c.chainName}`)
          .join(', ')}`,
      );
    }
    return match;
  }

  async function getLatestAttestedSepoliaHeight(chainKey: number): Promise<AttestedHeight> {
    const result = await chainInfoProvider.getLatestAttestedHeightAndHash(chainKey);
    return {
      height: result.height,
      hash: result.hash,
      isAttestation: result.isAttestation,
      exists: result.exists,
    };
  }

  async function waitForSepoliaAttestation(chainKey: number, height: number): Promise<void> {
    // Defaults inside the SDK poll every ~15s and time out after ~15m, which
    // matches the single-block finality expectation on CC3 Testnet.
    await chainInfoProvider.waitUntilHeightAttested(chainKey, height);
  }

  async function generateProof(chainKey: number, txHash: string): Promise<AttestcoinProof> {
    // Primary path: the Gluwa-hosted proof builder. Fast and cached, but an
    // external dependency — so we keep a local fallback below.
    const hosted = new proofProvider.service.ProofBuilder(chainKey, config.proofBuilderUrl);
    const hostedResult = await hosted.getProof(txHash);
    if (hostedResult.success && hostedResult.data) {
      return toAttestcoinProof(hostedResult.data, 'hosted');
    }

    // Fallback path: compute the proof locally from Sepolia block data. Slower
    // (extra RPC round-trips) but has no external API dependency, so the worker
    // stays available when the hosted service is unreachable.
    const chain = (await getSupportedChains()).find((c) => c.chainKey === chainKey);
    const encodingVersion =
      chain?.chainEncoding === encoding.EncodingVersion.V1
        ? encoding.EncodingVersion.V1
        : encoding.EncodingVersion.V1;
    const blockProvider = new proofProvider.raw.blockProvider.SimpleBlockProvider(sepoliaProvider);
    const rawBuilder = new proofProvider.raw.RawProofBuilder(
      chainKey,
      blockProvider,
      chainInfoProvider,
      encodingVersion,
    );
    const rawResult = await rawBuilder.getProof(txHash);
    if (rawResult.success && rawResult.data) {
      return toAttestcoinProof(rawResult.data, 'raw');
    }

    throw new Error(
      `Proof generation failed for ${txHash}. ` +
        `Hosted error: ${hostedResult.error ?? 'none'}. ` +
        `Raw error: ${rawResult.error ?? 'none'}.`,
    );
  }

  async function verifyReadonly(proof: AttestcoinProof): Promise<boolean> {
    return blockProverInstance.verifySingle(
      proof.chainKey,
      proof.headerNumber,
      proof.txBytes,
      proof.merkleProof,
      proof.continuityProof,
    );
  }

  async function verifyAndEmit(
    signer: Signer,
    proof: AttestcoinProof,
  ): Promise<ContractTransactionResponse> {
    return blockProverInstance.verifyAndEmitSingle(
      signer,
      proof.chainKey,
      proof.headerNumber,
      proof.txBytes,
      proof.merkleProof,
      proof.continuityProof,
    );
  }

  async function verifyTransactionInclusion({
    chainKey,
    txHash,
    signer,
    skipOnchainEmit,
  }: {
    chainKey: number;
    txHash: string;
    signer?: Signer;
    skipOnchainEmit?: boolean;
  }): Promise<VerificationResult> {
    const proof = await generateProof(chainKey, txHash);
    const readonlyVerification = await verifyReadonly(proof);

    let onchainTxHash: string | undefined;
    if (!skipOnchainEmit && signer) {
      const tx = await verifyAndEmit(signer, proof);
      const receipt = await tx.wait();
      onchainTxHash = receipt?.hash ?? tx.hash;
    }

    return {
      success: readonlyVerification,
      chainKey: proof.chainKey,
      txHash: proof.txHash,
      headerNumber: proof.headerNumber,
      readonlyVerification,
      onchainTxHash,
      proofSource: proof.source,
    };
  }

  return {
    creditcoinProvider,
    sepoliaProvider,
    getSupportedChains,
    resolveSepoliaChainKey,
    getLatestAttestedSepoliaHeight,
    waitForSepoliaAttestation,
    generateProof,
    verifyReadonly,
    verifyAndEmit,
    verifyTransactionInclusion,
  };
}

/** Build a Signer for the optional on-chain emit step. */
export function createCreditcoinSigner(config: WorkerConfig): Signer | undefined {
  if (!config.creditcoinPrivateKey) return undefined;
  return new Wallet(config.creditcoinPrivateKey, new JsonRpcProvider(config.creditcoinRpcUrl));
}

/** The SDK's full proof payload (hosted and raw builders both return this shape). */
type SdkContinuityResponse = proofProvider.ContinuityResponse;

/**
 * Normalize the SDK's proof payload into our trimmed {@link AttestcoinProof}.
 *
 * The SDK object carries a few bookkeeping fields (cache flags, timestamps)
 * that the precompile call does not consume; copying only what we need keeps
 * the rest of the codebase depending on a small, stable surface.
 */
function toAttestcoinProof(
  data: SdkContinuityResponse,
  source: 'hosted' | 'raw',
): AttestcoinProof {
  return {
    chainKey: data.chainKey,
    headerNumber: data.headerNumber,
    txIndex: data.txIndex,
    txHash: data.txHash,
    txBytes: data.txBytes,
    continuityProof: data.continuityProof,
    merkleProof: data.merkleProof,
    source,
  };
}
