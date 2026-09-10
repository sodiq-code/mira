/**
 * AI measurability experiment — compares three underwriting strategies
 * on a set of test borrowers to prove MIRA's AI makes better
 * capital-allocation decisions than simpler rules.
 *
 * Strategies:
 *   1. Collateral-only: approve everyone, flat 25% APR, max $50
 *   2. Static-score: approve if stablecoinVolume >= $5000, rate = 15%
 *   3. MIRA AI: the real decide() function with the LLM
 *
 * Metrics:
 *   - Approval rate
 *   - Average APR (cost of capital)
 *   - Estimated default rate (simulated from factor quality)
 *   - Capital efficiency (approved $ × (1 - default rate))
 *
 * The experiment runs N borrowers through each strategy, aggregates
 * the results, and returns a comparison table.
 */

import { decide, type AgentInput } from '@mira/worker';
import type { VerifiedFactors } from '@mira/shared';

export type Strategy = 'collateral-only' | 'static-score' | 'mira-ai';

export interface ExperimentBorrower {
  id: string;
  label: string;
  factors: VerifiedFactors;
  requestedAmount: number;
  requestedTermDays: number;
  /** Simulated default probability (0-1) based on factor quality. */
  defaultProbability: number;
}

export interface StrategyResult {
  strategy: Strategy;
  label: string;
  approvalRate: number;
  averageApr: number;
  estimatedDefaultRate: number;
  capitalEfficiency: number;
  totalApproved: number;
  totalRequested: number;
  decisions: Array<{
    borrowerId: string;
    borrowerLabel: string;
    decision: string;
    amount: number;
    apr: number;
    defaultProbability: number;
  }>;
}

// Test borrowers with varying profiles
const TEST_BORROWERS: ExperimentBorrower[] = [
  {
    id: 'b1',
    label: 'Strong DeFi user',
    factors: { walletAgeDays: 548, txCount90d: 142, stablecoinVolume90d: 28400, defiPositionCount: 7, priorMiraLoans: 2, priorMiraRepaid: 2, priorMiraDefaulted: 0 },
    requestedAmount: 500,
    requestedTermDays: 30,
    defaultProbability: 0.02,
  },
  {
    id: 'b2',
    label: 'Moderate activity',
    factors: { walletAgeDays: 180, txCount90d: 45, stablecoinVolume90d: 8200, defiPositionCount: 3, priorMiraLoans: 0, priorMiraRepaid: 0, priorMiraDefaulted: 0 },
    requestedAmount: 200,
    requestedTermDays: 30,
    defaultProbability: 0.08,
  },
  {
    id: 'b3',
    label: 'New wallet, high volume',
    factors: { walletAgeDays: 15, txCount90d: 30, stablecoinVolume90d: 15000, defiPositionCount: 2, priorMiraLoans: 0, priorMiraRepaid: 0, priorMiraDefaulted: 0 },
    requestedAmount: 300,
    requestedTermDays: 7,
    defaultProbability: 0.15,
  },
  {
    id: 'b4',
    label: 'Low activity',
    factors: { walletAgeDays: 90, txCount90d: 12, stablecoinVolume90d: 1200, defiPositionCount: 1, priorMiraLoans: 0, priorMiraRepaid: 0, priorMiraDefaulted: 0 },
    requestedAmount: 100,
    requestedTermDays: 7,
    defaultProbability: 0.20,
  },
  {
    id: 'b5',
    label: 'Prior default',
    factors: { walletAgeDays: 365, txCount90d: 60, stablecoinVolume90d: 9000, defiPositionCount: 4, priorMiraLoans: 1, priorMiraRepaid: 0, priorMiraDefaulted: 1 },
    requestedAmount: 250,
    requestedTermDays: 30,
    defaultProbability: 0.35,
  },
  {
    id: 'b6',
    label: 'Returning borrower',
    factors: { walletAgeDays: 300, txCount90d: 88, stablecoinVolume90d: 15600, defiPositionCount: 4, priorMiraLoans: 1, priorMiraRepaid: 1, priorMiraDefaulted: 0 },
    requestedAmount: 400,
    requestedTermDays: 30,
    defaultProbability: 0.05,
  },
  {
    id: 'b7',
    label: 'Very weak profile',
    factors: { walletAgeDays: 5, txCount90d: 2, stablecoinVolume90d: 100, defiPositionCount: 0, priorMiraLoans: 0, priorMiraRepaid: 0, priorMiraDefaulted: 0 },
    requestedAmount: 500,
    requestedTermDays: 90,
    defaultProbability: 0.60,
  },
  {
    id: 'b8',
    label: 'Excellent profile',
    factors: { walletAgeDays: 730, txCount90d: 200, stablecoinVolume90d: 50000, defiPositionCount: 10, priorMiraLoans: 5, priorMiraRepaid: 5, priorMiraDefaulted: 0 },
    requestedAmount: 1000,
    requestedTermDays: 90,
    defaultProbability: 0.01,
  },
];

function collateralOnly(borrower: ExperimentBorrower) {
  // Approve everyone, flat 25% APR, max $50
  return {
    decision: 'approve' as const,
    amount: Math.min(borrower.requestedAmount, 50),
    apr: 25.0,
  };
}

function staticScore(borrower: ExperimentBorrower) {
  // Approve if stablecoinVolume >= $5000, rate = 15%, max $200
  if (borrower.factors.stablecoinVolume90d < 5000) {
    return { decision: 'decline' as const, amount: 0, apr: 0 };
  }
  if (borrower.factors.priorMiraDefaulted > 0 && borrower.factors.priorMiraRepaid === 0) {
    return { decision: 'decline' as const, amount: 0, apr: 0 };
  }
  return {
    decision: 'approve' as const,
    amount: Math.min(borrower.requestedAmount, 200),
    apr: 15.0,
  };
}

async function miraAI(borrower: ExperimentBorrower) {
  const input: AgentInput = {
    factors: borrower.factors,
    requestedAmount: borrower.requestedAmount,
    requestedTermDays: borrower.requestedTermDays,
  };
  const result = await decide(input);
  return {
    decision: result.decision,
    amount: result.approvedAmount,
    apr: result.interestRateApr,
  };
}

export async function runExperiment(): Promise<StrategyResult[]> {
  const strategies: Array<{ strategy: Strategy; label: string; fn: (b: ExperimentBorrower) => Promise<{ decision: string; amount: number; apr: number }> }> = [
    { strategy: 'collateral-only', label: 'Collateral-only', fn: async (b) => collateralOnly(b) },
    { strategy: 'static-score', label: 'Static score', fn: async (b) => staticScore(b) },
    { strategy: 'mira-ai', label: 'MIRA AI underwriting', fn: async (b) => miraAI(b) },
  ];

  const results: StrategyResult[] = [];

  for (const { strategy, label, fn } of strategies) {
    const decisions: StrategyResult['decisions'] = [];
    let approvedCount = 0;
    let totalApproved = 0;
    let totalRequested = 0;
    let aprSum = 0;
    let weightedDefaultRate = 0;
    let weightedCapital = 0;

    for (const borrower of TEST_BORROWERS) {
      const result = await fn(borrower);
      const isApproved = result.decision !== 'decline';
      totalRequested += borrower.requestedAmount;

      if (isApproved) {
        approvedCount++;
        totalApproved += result.amount;
        aprSum += result.apr;
        weightedDefaultRate += result.amount * borrower.defaultProbability;
        weightedCapital += result.amount;
      }

      decisions.push({
        borrowerId: borrower.id,
        borrowerLabel: borrower.label,
        decision: result.decision,
        amount: result.amount,
        apr: result.apr,
        defaultProbability: borrower.defaultProbability,
      });
    }

    const approvalRate = (approvedCount / TEST_BORROWERS.length) * 100;
    const averageApr = approvedCount > 0 ? aprSum / approvedCount : 0;
    const estimatedDefaultRate = weightedCapital > 0 ? (weightedDefaultRate / weightedCapital) * 100 : 0;
    const capitalEfficiency = totalApproved * (1 - estimatedDefaultRate / 100);

    results.push({
      strategy,
      label,
      approvalRate,
      averageApr,
      estimatedDefaultRate,
      capitalEfficiency,
      totalApproved,
      totalRequested,
      decisions,
    });
  }

  return results;
}
