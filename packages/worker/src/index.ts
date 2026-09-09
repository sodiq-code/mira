/**
 * Public entry point for the @mira/worker package.
 *
 * Re-exports the Attestcoin integration surface and the typed contract
 * clients (Policy, Loan) and the credit-check read path so consumers can
 * import from a single location:
 *
 * ```ts
 * import {
 *   createAttestcoinClient,
 *   createPolicyClient,
 *   createLoanClient,
 *   runCreditCheck,
 *   loadWorkerConfig,
 * } from '@mira/worker';
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

export {
  loadWorkerConfig,
  type WorkerConfig,
} from './config';

export {
  createPolicyClient,
  type PolicyClient,
  type PolicyDecision,
  type PolicyBounds,
} from './policy';

export {
  createLoanClient,
  LoanStatus,
  type LoanClient,
  type LoanData,
  type LoanOriginateResult,
  type LoanRepayResult,
  type LoanDefaultResult,
  type LoanOriginatedEvent,
  type LoanRepaidEvent,
  type LoanDefaultedEvent,
} from './loan';

export {
  runCreditCheck,
  createCreditChecker,
  SEPOLIA_STABLECOINS,
  type CreditCheckResult,
  type CreditCheckOptions,
  type StablecoinSpec,
} from './credit-check';
