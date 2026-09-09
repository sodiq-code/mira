/**
 * Public entry point for the @mira/worker package.
 *
 * Re-exports the Attestcoin integration surface so consumers can import from a
 * single location:
 *
 * ```ts
 * import { createAttestcoinClient, loadWorkerConfig } from '@mira/worker';
 * ```
 */

export {
  createAttestcoinClient,
  createCreditcoinSigner,
  findSepoliaChainKey,
  decodeChainName,
  type AttestcoinClient,
  type AttestcoinProof,
  type AttestedHeight,
  type SupportedChain,
  type VerificationResult,
} from './attestcoin';

export { loadWorkerConfig, type WorkerConfig } from './config';
