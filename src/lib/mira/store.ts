/**
 * In-memory loan + reputation store for the demo.
 *
 * In production, loan state lives in the Loan contract on Creditcoin CC3
 * Testnet and reputation lives in the AgentReputation / BorrowerReputation
 * contracts (see packages/contracts). The worker reads/writes those via
 * ethers. For a reliable live demo we keep an in-memory mirror that the API
 * routes mutate, seeded with a believable baseline so the agent reputation
 * dashboard is never empty on first load.
 *
 * The store is a module-level singleton: it survives across requests within
 * the same dev server process (and resets on server restart, which is fine
 * for a demo). It is intentionally NOT persisted to disk — demo data should
 * not leak into the repo or survive a redeploy.
 */

import type {
  AgentReputationSnapshot,
  LoanStatus,
  LoanTerms,
} from '@mira/shared';
import { synthesizeLoanId, synthesizeOriginTxHash } from './proofs';

export interface LoanRecord extends LoanTerms {
  loanId: string;
  originTxHash: string;
  /** Block at which the loan was originated (CC3 height). */
  originatedBlock: number;
  /** Due block = originatedBlock + term-days worth of blocks (~12s blocks). */
  dueBlock: number;
  /** Hash of the reasoning paragraph (mirrors on-chain decisionReasoningHash). */
  reasoningHash: string;
  /** The verified factor snapshot at decision time. */
  factorsSnapshot: LoanTerms['borrower'] extends never ? never : FactorsSnapshot;
  /** When the loan was created (ISO). */
  createdAt: string;
  /** Optional repayment evidence. */
  repaymentTxHash?: string;
  repaidAtBlock?: number;
  /** Optional default / writability evidence. */
  writabilityTxHash?: string;
  defaultedAtBlock?: number;
  /** Borrower-facing label for the profile that produced this loan. */
  borrowerLabel?: string;
}

export interface FactorsSnapshot {
  walletAgeDays: number;
  txCount90d: number;
  stablecoinVolume90d: number;
  defiPositionCount: number;
  priorMiraLoans: number;
  priorMiraRepaid: number;
  priorMiraDefaulted: number;
  requestedAmount: number;
  requestedTermDays: number;
  approvedAmount: number;
  interestRateApr: number;
  confidence: number;
}

export interface AgentReputationState extends AgentReputationSnapshot {
  lastUpdatedBlock: number;
  /** Baseline score before any demo activity. */
  baseScore: number;
}

// ─── Singleton store ────────────────────────────────────────────────────────

const CC3_BLOCK_TIME_S = 12;
const SECONDS_PER_DAY = 86_400;
const BASE_CC3_BLOCK = 4_821_400;
const BASE_AGENT_SCORE = 720;
const STARTING_LOANS = 14;
const STARTING_REPAID = 12;
const STARTING_DEFAULTED = 2;

let currentBlock = BASE_CC3_BLOCK;
const loans = new Map<string, LoanRecord>();
const borrowerReputation = new Map<string, { repaid: number; defaulted: number }>();

const agentReputation: AgentReputationState = {
  cumulativeLoans: STARTING_LOANS,
  cumulativeRepaid: STARTING_REPAID,
  cumulativeDefaulted: STARTING_DEFAULTED,
  currentScore: BASE_AGENT_SCORE,
  baseScore: BASE_AGENT_SCORE,
  lastUpdatedBlock: BASE_CC3_BLOCK,
};

// Seed a few historical loans so the reputation dashboard has content.
function seedHistory() {
  const seeds: Array<Partial<LoanRecord> & { amount: number; rate: number; term: number }> = [
    { amount: 250, rate: 13.5, term: 30, borrowerLabel: '0x7a3c…f2e1' },
    { amount: 500, rate: 15.0, term: 30, borrowerLabel: '0x9f12…4b8a' },
    { amount: 100, rate: 12.0, term: 7, borrowerLabel: '0x2b8d…c0f3' },
  ];

  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    const loanId = synthesizeLoanId(`seed-${i}`);
    const block = BASE_CC3_BLOCK - (seeds.length - i) * 7200; // ~1 day apart
    const record: LoanRecord = {
      loanId,
      borrower: `0x${i.toString(16).padStart(40, '0')}`,
      amount: s.amount,
      rate: s.rate,
      term: s.term,
      dueBlock: block + Math.round((s.term * SECONDS_PER_DAY) / CC3_BLOCK_TIME_S),
      status: 'Repaid',
      originTxHash: synthesizeOriginTxHash(`seed-${i}`),
      originatedBlock: block,
      reasoningHash: `0x${(i * 123456).toString(16).padStart(64, '0')}`,
      factorsSnapshot: {
        walletAgeDays: 200 + i * 40,
        txCount90d: 60 + i * 10,
        stablecoinVolume90d: 10000 + i * 3000,
        defiPositionCount: 3,
        priorMiraLoans: i,
        priorMiraRepaid: i,
        priorMiraDefaulted: 0,
        requestedAmount: s.amount,
        requestedTermDays: s.term,
        approvedAmount: s.amount,
        interestRateApr: s.rate,
        confidence: 80 + i,
      },
      createdAt: new Date(Date.now() - (seeds.length - i) * 86_400_000).toISOString(),
      repaidAtBlock: block + Math.round((s.term * SECONDS_PER_DAY) / CC3_BLOCK_TIME_S) - 10,
      repaymentTxHash: synthesizeOriginTxHash(`repay-seed-${i}`),
      borrowerLabel: s.borrowerLabel,
    };
    loans.set(loanId, record);
  }
}
seedHistory();

// ─── Block tick (advances with each origination to feel alive) ──────────────

function advanceBlock(by = 1): number {
  currentBlock += by;
  return currentBlock;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function getAgentReputation(): AgentReputationState {
  return { ...agentReputation };
}

export function getRecentLoans(limit = 10): LoanRecord[] {
  return Array.from(loans.values())
    .sort((a, b) => b.originatedBlock - a.originatedBlock)
    .slice(0, limit);
}

export function getLoan(loanId: string): LoanRecord | undefined {
  return loans.get(loanId);
}

export function getBorrowerReputation(address: string): { repaid: number; defaulted: number } {
  return borrowerReputation.get(address.toLowerCase()) ?? { repaid: 0, defaulted: 0 };
}

/**
 * Return the full loan history for a borrower address — every loan originated
 * against this wallet, most-recent first. This powers the borrower-side loan
 * history view so a connected wallet can audit its own MIRA track record the
 * same way the public can audit the agent's.
 *
 * In production this reads from the Loan contract (filtered by borrower) +
 * the BorrowerReputation contract; here we read from the demo store.
 */
export function getBorrowerLoans(address: string): LoanRecord[] {
  const normalized = address.toLowerCase();
  return Array.from(loans.values())
    .filter((loan) => loan.borrower.toLowerCase() === normalized)
    .sort((a, b) => b.originatedBlock - a.originatedBlock);
}

/**
 * A compact 12-point activity series for the reputation dashboard sparkline:
 * cumulative loans originated per "bucket" (bucket = ~1 day of blocks). Used
 * to turn the static cumulative-loans number into a small trend so the
 * dashboard reads as analytics rather than a snapshot.
 */
export function getLoanActivitySeries(buckets = 12): number[] {
  const all = Array.from(loans.values()).sort(
    (a, b) => a.originatedBlock - b.originatedBlock,
  );
  if (all.length === 0) return new Array(buckets).fill(0);

  const minBlock = all[0].originatedBlock;
  const maxBlock = all[all.length - 1].originatedBlock;
  const span = Math.max(1, maxBlock - minBlock);
  const bucketSize = span / buckets;

  const series = new Array(buckets).fill(0);
  for (const loan of all) {
    const idx = Math.min(buckets - 1, Math.floor((loan.originatedBlock - minBlock) / bucketSize));
    series[idx] += 1;
  }
  // Convert to cumulative so the sparkline shows growth.
  for (let i = 1; i < series.length; i++) {
    series[i] += series[i - 1];
  }
  return series;
}

export interface OriginateInput {
  borrower: string;
  borrowerLabel?: string;
  amount: number;
  rate: number;
  term: number;
  confidence: number;
  reasoning: string;
  factors: FactorsSnapshot;
}

export function originateLoan(input: OriginateInput): LoanRecord {
  const loanId = synthesizeLoanId(`${input.borrower}-${loans.size}`);
  const originatedBlock = advanceBlock(2);
  const termBlocks = Math.round((input.term * SECONDS_PER_DAY) / CC3_BLOCK_TIME_S);
  const dueBlock = originatedBlock + termBlocks;

  const record: LoanRecord = {
    loanId,
    borrower: input.borrower,
    borrowerLabel: input.borrowerLabel,
    amount: input.amount,
    rate: input.rate,
    term: input.term,
    dueBlock,
    status: 'Originated',
    originTxHash: synthesizeOriginTxHash(loanId),
    originatedBlock,
    reasoningHash: hashReasoning(input.reasoning),
    factorsSnapshot: input.factors,
    createdAt: new Date().toISOString(),
  };

  loans.set(loanId, record);

  agentReputation.cumulativeLoans += 1;
  agentReputation.lastUpdatedBlock = originatedBlock;
  recomputeAgentScore();

  return record;
}

export function markLoanRepaid(
  loanId: string,
  repaymentTxHash: string,
): { loan: LoanRecord; agent: AgentReputationState; borrower: { repaid: number; defaulted: number } } | null {
  const loan = loans.get(loanId);
  if (!loan || loan.status !== 'Originated') return null;

  const repaidAtBlock = advanceBlock(1);
  loan.status = 'Repaid';
  loan.repaymentTxHash = repaymentTxHash;
  loan.repaidAtBlock = repaidAtBlock;

  agentReputation.cumulativeRepaid += 1;
  agentReputation.lastUpdatedBlock = repaidAtBlock;
  recomputeAgentScore();

  const borrowerKey = loan.borrower.toLowerCase();
  const current = borrowerReputation.get(borrowerKey) ?? { repaid: 0, defaulted: 0 };
  current.repaid += 1;
  borrowerReputation.set(borrowerKey, current);

  return { loan, agent: getAgentReputation(), borrower: current };
}

export function markLoanDefaulted(
  loanId: string,
): { loan: LoanRecord; agent: AgentReputationState; writabilityTxHash: string } | null {
  const loan = loans.get(loanId);
  if (!loan || (loan.status !== 'Originated' && loan.status !== 'Pending')) return null;

  const defaultedAtBlock = advanceBlock(1);
  const writabilityTxHash = synthesizeOriginTxHash(`writability-${loanId}`);

  loan.status = 'Defaulted';
  loan.writabilityTxHash = writabilityTxHash;
  loan.defaultedAtBlock = defaultedAtBlock;

  agentReputation.cumulativeDefaulted += 1;
  agentReputation.lastUpdatedBlock = defaultedAtBlock;
  recomputeAgentScore();

  const borrowerKey = loan.borrower.toLowerCase();
  const current = borrowerReputation.get(borrowerKey) ?? { repaid: 0, defaulted: 0 };
  current.defaulted += 1;
  borrowerReputation.set(borrowerKey, current);

  return { loan, agent: getAgentReputation(), writabilityTxHash };
}

/**
 * Recompute the agent's reputation score.
 *
 * Formula (mirrors the on-chain AgentReputation scoring intent): start from
 * a base, add 10 per repaid loan, subtract 25 per default. Clamped to a
 * 0–1000 range so the score stays meaningful as the ledger grows.
 */
function recomputeAgentScore() {
  const score =
    agentReputation.baseScore +
    agentReputation.cumulativeRepaid * 10 -
    agentReputation.cumulativeDefaulted * 25;
  agentReputation.currentScore = Math.max(0, Math.min(1000, score));
}

function hashReasoning(text: string): string {
  // Lightweight, non-cryptographic hash for the on-chain reasoning anchor.
  // The real contract stores keccak256; this is a demo stand-in.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761) >>> 0;
    h2 = Math.imul(h2 ^ ch, 1597334677) >>> 0;
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) >>> 0;
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909) >>> 0;
  const hex = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(4);
  return `0x${hex.slice(0, 64)}`;
}

export function getCurrentBlock(): number {
  return currentBlock;
}

export type { LoanStatus };
