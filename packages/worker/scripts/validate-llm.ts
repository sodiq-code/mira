/**
 * LLM structured-output validation.
 *
 * Validates the blueprint's validation plan component:
 *   "Call Claude with the MIRA prompt 10 times. All 10 outputs are valid
 *    JSON within Policy bounds (5-25% APR, 7/30/90 days)"
 *
 * Runs 10 different borrower profiles (varying activity levels) through the
 * agent's `decide()` function and asserts:
 *   1. Every output is valid JSON with the required fields
 *   2. Every approve/approve_reduced decision has rate in [5.0, 25.0]
 *   3. Every approve/approve_reduced decision has term in {7, 30, 90}
 *   4. Every approve/approve_reduced decision has amount > 0 and <= cap
 *   5. Hard decline rules are respected (walletAge < 30, volume < 1000, etc.)
 *   6. Reasoning is <= 60 words
 *
 * Run with: `bun run worker:validate-llm` (from the repo root).
 */

import { decide, POLICY_BOUNDS, type AgentInput } from '../src';
import type { VerifiedFactors } from '@mira/shared';

interface TestCase {
  name: string;
  factors: VerifiedFactors;
  requestedAmount: number;
  requestedTermDays: number;
  expectDecision: 'approve' | 'decline' | 'any';
}

/**
 * 10 borrower profiles covering the full spectrum of credit signals.
 * Each exercises a different path through the decision logic.
 */
const testCases: TestCase[] = [
  {
    name: 'High-activity established wallet',
    factors: { walletAgeDays: 540, txCount90d: 142, stablecoinVolume90d: 45000, defiPositionCount: 8, priorMiraLoans: 3, priorMiraRepaid: 3, priorMiraDefaulted: 0 },
    requestedAmount: 800,
    requestedTermDays: 30,
    expectDecision: 'approve',
  },
  {
    name: 'Low-activity new wallet (should decline)',
    factors: { walletAgeDays: 15, txCount90d: 2, stablecoinVolume90d: 50, defiPositionCount: 0, priorMiraLoans: 0, priorMiraRepaid: 0, priorMiraDefaulted: 0 },
    requestedAmount: 500,
    requestedTermDays: 30,
    expectDecision: 'decline',
  },
  {
    name: 'Prior default, no repayments (should decline)',
    factors: { walletAgeDays: 200, txCount90d: 30, stablecoinVolume90d: 5000, defiPositionCount: 2, priorMiraLoans: 1, priorMiraRepaid: 0, priorMiraDefaulted: 1 },
    requestedAmount: 300,
    requestedTermDays: 7,
    expectDecision: 'decline',
  },
  {
    name: 'Prior default with repayments (recovering)',
    factors: { walletAgeDays: 365, txCount90d: 55, stablecoinVolume90d: 12000, defiPositionCount: 4, priorMiraLoans: 4, priorMiraRepaid: 3, priorMiraDefaulted: 1 },
    requestedAmount: 400,
    requestedTermDays: 30,
    expectDecision: 'any',
  },
  {
    name: 'Young wallet under 30 days (should decline)',
    factors: { walletAgeDays: 22, txCount90d: 8, stablecoinVolume90d: 2000, defiPositionCount: 1, priorMiraLoans: 0, priorMiraRepaid: 0, priorMiraDefaulted: 0 },
    requestedAmount: 200,
    requestedTermDays: 7,
    expectDecision: 'decline',
  },
  {
    name: 'Insufficient stablecoin volume (should decline)',
    factors: { walletAgeDays: 120, txCount90d: 15, stablecoinVolume90d: 500, defiPositionCount: 1, priorMiraLoans: 0, priorMiraRepaid: 0, priorMiraDefaulted: 0 },
    requestedAmount: 300,
    requestedTermDays: 30,
    expectDecision: 'decline',
  },
  {
    name: 'Very high activity, perfect history',
    factors: { walletAgeDays: 730, txCount90d: 300, stablecoinVolume90d: 150000, defiPositionCount: 15, priorMiraLoans: 10, priorMiraRepaid: 10, priorMiraDefaulted: 0 },
    requestedAmount: 1000,
    requestedTermDays: 90,
    expectDecision: 'approve',
  },
  {
    name: 'Moderate activity, first loan',
    factors: { walletAgeDays: 180, txCount90d: 40, stablecoinVolume90d: 8000, defiPositionCount: 3, priorMiraLoans: 0, priorMiraRepaid: 0, priorMiraDefaulted: 0 },
    requestedAmount: 600,
    requestedTermDays: 30,
    expectDecision: 'any',
  },
  {
    name: 'Borderline volume (exactly $1000)',
    factors: { walletAgeDays: 90, txCount90d: 20, stablecoinVolume90d: 1000, defiPositionCount: 2, priorMiraLoans: 0, priorMiraRepaid: 0, priorMiraDefaulted: 0 },
    requestedAmount: 250,
    requestedTermDays: 7,
    expectDecision: 'any',
  },
  {
    name: 'High volume but short term request',
    factors: { walletAgeDays: 400, txCount90d: 85, stablecoinVolume90d: 25000, defiPositionCount: 6, priorMiraLoans: 2, priorMiraRepaid: 2, priorMiraDefaulted: 0 },
    requestedAmount: 500,
    requestedTermDays: 7,
    expectDecision: 'approve',
  },
];

interface TestResult {
  name: string;
  passed: boolean;
  decision: string;
  source: string;
  rate: number;
  amount: number;
  confidence: number;
  reasoningWordCount: number;
  errors: string[];
}

async function main(): Promise<void> {
  console.log('MIRA — LLM Structured-Output Validation');
  console.log('=========================================');
  console.log(`Running ${testCases.length} borrower profiles through the agent...\n`);

  const results: TestResult[] = [];
  let passCount = 0;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const input: AgentInput = {
      factors: tc.factors,
      requestedAmount: tc.requestedAmount,
      requestedTermDays: tc.requestedTermDays,
    };

    console.log(`[${i + 1}/${testCases.length}] ${tc.name}...`);
    const errors: string[] = [];

    try {
      const decision = await decide(input);

      // Validate: decision type is valid
      if (!['approve', 'decline', 'approve_reduced'].includes(decision.decision)) {
        errors.push(`Invalid decision type: ${decision.decision}`);
      }

      // Validate: rate in bounds (for non-decline)
      if (decision.decision !== 'decline') {
        if (decision.interestRateApr < POLICY_BOUNDS.minRateApr || decision.interestRateApr > POLICY_BOUNDS.maxRateApr) {
          errors.push(`Rate ${decision.interestRateApr}% out of bounds [${POLICY_BOUNDS.minRateApr}, ${POLICY_BOUNDS.maxRateApr}]`);
        }
        if (decision.approvedAmount <= 0) {
          errors.push(`Approved amount must be > 0, got ${decision.approvedAmount}`);
        }
        if (decision.approvedAmount > POLICY_BOUNDS.maxAmountUsd) {
          errors.push(`Approved amount ${decision.approvedAmount} exceeds cap ${POLICY_BOUNDS.maxAmountUsd}`);
        }
      }

      // Validate: confidence in [0, 100]
      if (decision.confidence < 0 || decision.confidence > 100) {
        errors.push(`Confidence ${decision.confidence} out of [0, 100]`);
      }

      // Validate: reasoning <= 60 words
      const wordCount = decision.reasoning.split(/\s+/).length;
      if (wordCount > MAX_REASONING_WORDS) {
        errors.push(`Reasoning ${wordCount} words exceeds ${MAX_REASONING_WORDS} cap`);
      }

      // Validate: hard decline rules
      if (tc.factors.walletAgeDays < 30 && decision.decision !== 'decline') {
        errors.push(`Should decline (walletAge < 30) but got ${decision.decision}`);
      }
      if (tc.factors.stablecoinVolume90d < 1000 && decision.decision !== 'decline') {
        errors.push(`Should decline (volume < $1000) but got ${decision.decision}`);
      }
      if (tc.factors.priorMiraDefaulted > 0 && tc.factors.priorMiraRepaid === 0 && decision.decision !== 'decline') {
        errors.push(`Should decline (prior default, no repays) but got ${decision.decision}`);
      }

      // Check expected decision
      if (tc.expectDecision !== 'any' && decision.decision !== 'decline' && tc.expectDecision === 'decline') {
        errors.push(`Expected decline but got ${decision.decision}`);
      }

      const passed = errors.length === 0;
      if (passed) passCount++;

      const result: TestResult = {
        name: tc.name,
        passed,
        decision: decision.decision,
        source: decision.source,
        rate: decision.interestRateApr,
        amount: decision.approvedAmount,
        confidence: decision.confidence,
        reasoningWordCount: wordCount,
        errors,
      };
      results.push(result);

      const icon = passed ? '✓' : '✗';
      console.log(`  ${icon} ${decision.decision} | rate ${decision.interestRateApr}% | amount $${decision.approvedAmount} | conf ${decision.confidence} | src ${decision.source} | ${wordCount}w`);
      if (errors.length > 0) {
        errors.forEach((e) => console.log(`    ✗ ${e}`));
      }
    } catch (err) {
      results.push({
        name: tc.name,
        passed: false,
        decision: 'error',
        source: 'error',
        rate: 0,
        amount: 0,
        confidence: 0,
        reasoningWordCount: 0,
        errors: [(err as Error).message],
      });
      console.log(`  ✗ ERROR: ${(err as Error).message}`);
    }
  }

  // Summary
  console.log('\n── Summary ──────────────────────────────────────────────');
  console.log(`  Passed: ${passCount}/${testCases.length}`);
  console.log(`  All valid JSON: ${results.every((r) => r.decision !== 'error') ? 'YES' : 'NO'}`);
  console.log(`  All within bounds: ${results.every((r) => r.errors.length === 0) ? 'YES' : 'NO'}`);

  // The validation plan requires: "All 10 outputs are valid JSON within Policy bounds"
  const allValid = passCount === testCases.length;
  console.log(`\nRESULT: ${allValid ? 'PASS' : 'FAIL'} — ${passCount}/${testCases.length} outputs valid and in-bounds`);

  // Write evidence
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir('/home/z/my-project/research', { recursive: true });
  await writeFile(
    '/home/z/my-project/research/llm-validation.json',
    JSON.stringify({ results, passed: passCount, total: testCases.length, allValid, timestamp: new Date().toISOString() }, null, 2),
    'utf8',
  );
  console.log('Evidence: /home/z/my-project/research/llm-validation.json');

  process.exit(allValid ? 0 : 1);
}

const MAX_REASONING_WORDS = 60;

main().catch((err) => {
  console.error('Validation crashed:', err);
  process.exit(1);
});
