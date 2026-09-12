/**
 * Shared request/response contracts between the MIRA worker and frontend.
 *
 * Every field here is part of a public API boundary, so changes are
 * breaking — keep the shapes minimal and add new optional fields rather than
 * reshuffling existing ones.
 */

// ─── Credit check ───────────────────────────────────────────────────────────

export interface CreditCheckRequest {
  walletAddress: string;
}

export interface VerifiedFactors {
  walletAgeDays: number;
  txCount90d: number;
  stablecoinVolume90d: number;
  defiPositionCount: number;
  priorMiraLoans: number;
  priorMiraRepaid: number;
  priorMiraDefaulted: number;
}

export interface CreditCheckResponse {
  verified: boolean;
  factors: VerifiedFactors;
  /** CC3 Testnet explorer links for every proof that backed the factors. */
  proofTxHashes: string[];
  /** True when synthetic data stood in for live on-chain reads. */
  demoMode: boolean;
  /**
   * How the factors were derived. Lets the UI label each path distinctly so
   * real and simulated data are never blurred.
   *   - 'attestcoin'        : real runCreditCheck — factors proven via the
   *                           BlockProver precompile (demoMode: false).
   *   - 'preset-verified'   : the known verified demo wallet — factors come
   *                           from a real prior credit-check run, cached.
   *                           (demoMode: false).
   *   - 'synthetic'         : a preset demo profile or a hash-derived
   *                           synthetic vector for unknown wallets
   *                           (demoMode: true).
   *   - 'fallback'          : real runCreditCheck was attempted but failed
   *                           or timed out, so a synthetic vector stood in
   *                           (demoMode: true, fallbackReason populated).
   * Omitted on older responses — consumers should treat undefined as
   * 'synthetic' (the historical behavior).
   */
  verificationSource?: 'attestcoin' | 'preset-verified' | 'synthetic' | 'fallback';
  /**
   * Populated only when verificationSource === 'fallback'. Explains why the
   * real Attestcoin path could not complete (e.g. "RPC timeout", "no verified
   * Sepolia txs", "Creditcoin RPC unreachable") so the UI can surface it.
   */
  fallbackReason?: string;
  /**
   * Populated only when verificationSource === 'attestcoin' | 'preset-verified'.
   * Diagnostic counts from the real runCreditCheck path: how many Sepolia txs
   * were scanned, how many passed Attestcoin verification, how many proof
   * attempts errored. Lets the UI show "5 of 5 Sepolia txs verified" etc.
   */
  scannedTxCount?: number;
  verifiedTxCount?: number;
  proofErrorCount?: number;
}

// ─── Loan application ───────────────────────────────────────────────────────

export type LoanDecision = 'approve' | 'decline' | 'approve_reduced';

export interface LoanApplyRequest {
  walletAddress: string;
  requestedAmount: number;
  requestedTermDays: number;
}

export interface AgentReputationSnapshot {
  cumulativeLoans: number;
  cumulativeRepaid: number;
  cumulativeDefaulted: number;
  currentScore: number;
}

export interface LoanApplyResponse {
  decision: LoanDecision;
  approvedAmount: number;
  interestRateApr: number;
  confidence: number;
  reasoning: string;
  /** Creditcoin contract address identifying the originated loan. */
  loanId: string;
  originTxHash: string;
  agentReputation: AgentReputationSnapshot;
  /**
   * The original amount the borrower requested (USD). Present so the UI can
   * surface a clamp callout when the approved amount is lower than requested.
   */
  requestedAmount?: number;
  /**
   * The on-chain effective borrower cap (USD, integer) that the approved
   * amount was clamped to. Present when the route read the cap from the
   * Policy contract (i.e. LOAN_ADDRESS was set).
   */
  effectiveCap?: number;
  /**
   * True when the approved amount was reduced from the requested amount
   * (either by the LLM decision or by the on-chain tier cap). The UI uses
   * this to render the "MIRA approved less than you asked for" callout.
   */
  wasClamped?: boolean;
}

// ─── Repayment ──────────────────────────────────────────────────────────────

export interface LoanRepayRequest {
  loanId: string;
  repaymentTxHash: string;
  /**
   * Optional real Sepolia repayment transaction hash. When provided, the
   * Loan contract verifies the Attestcoin inclusion proof on-chain via
   * markRepaidWithProof — the contract (not the worker) is the trust
   * anchor. When omitted, the worker-trusted markRepaid path is used.
   */
  sepoliaRepayTxHash?: string;
}

export interface BorrowerReputationSnapshot {
  repaidCount: number;
  defaultedCount: number;
}

export interface LoanRepayResponse {
  repaid: boolean;
  newBorrowerReputation: BorrowerReputationSnapshot;
  newAgentReputation: AgentReputationSnapshot;
  verificationTxHash: string;
}

// ─── Agent reputation ───────────────────────────────────────────────────────

export interface AgentReputationResponse extends AgentReputationSnapshot {
  lastUpdatedBlock: number;
}

// ─── Demo-only default trigger ──────────────────────────────────────────────

export interface DemoTriggerDefaultRequest {
  loanId: string;
}

export interface DemoTriggerDefaultResponse {
  writabilityTxHash: string;
  agentReputationAfter: AgentReputationSnapshot;
}

// ─── Loan lifecycle ─────────────────────────────────────────────────────────

export type LoanStatus = 'Pending' | 'Originated' | 'Repaid' | 'Defaulted';

export interface LoanTerms {
  borrower: string;
  amount: number;
  rate: number;
  term: number;
  dueBlock: number;
  status: LoanStatus;
}
