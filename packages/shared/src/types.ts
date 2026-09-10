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
