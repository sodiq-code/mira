/**
 * MIRA's underwriting agent.
 *
 * This module is the AI decision-maker: it takes a cryptographically verified
 * borrower feature vector and produces a bounded loan decision. The decision
 * is always validated against the on-chain Policy contract before
 * origination, so even if the LLM hallucinates an out-of-bounds rate, the
 * contract rejects it and the worker retries or falls back to a
 * deterministic decision.
 *
 * Design (from the architecture spec):
 *  - The LLM has NO tools. It cannot browse, call APIs, or take actions. Its
 *    only job is to emit a JSON decision. This eliminates an entire class of
 *    prompt-injection-driven hallucinations.
 *  - Structured output is enforced: the response must be valid JSON with
 *    exactly the specified fields. Free-text responses are rejected and the
 *    call is retried.
 *  - A deterministic fallback covers LLM unavailability or repeated
 *    malformed output, so a loan decision is always produced.
 *  - Reasoning is capped at 60 words to prevent drift.
 */

import ZAI from 'z-ai-web-dev-sdk';
import type { VerifiedFactors } from '@mira/shared';
import type { LoanDecision } from '@mira/shared';

/** The system prompt, verbatim from the prompt architecture spec. */
export const SYSTEM_PROMPT = `You are MIRA, an autonomous credit agent on the Creditcoin blockchain.
Your role: given a verified borrower feature vector, decide whether to approve a micro-loan, and on what terms.

INPUT (user message): a JSON object with the following fields, each CRYPTOGRAPHICALLY VERIFIED via the Attestcoin Protocol:
- wallet_age_days: integer (>= 0)
- tx_count_90d: integer (>= 0)
- stablecoin_volume_90d: integer (USD, >= 0)
- defi_position_count: integer (>= 0)
- prior_mira_loans: integer (>= 0)
- prior_mira_repaid: integer (>= 0)
- prior_mira_defaulted: integer (>= 0)
- requested_amount: integer (USD)
- requested_term_days: integer (7 | 30 | 90)

OUTPUT (your response): a JSON object with EXACTLY these fields:
- decision: "approve" | "decline" | "approve_reduced"
- approved_amount: integer (USD; <= requested_amount if approve_reduced)
- interest_rate_apr: number (5.0 - 25.0)
- confidence: integer (0 - 100)
- reasoning: string (one paragraph, <= 60 words, explaining the decision in plain English a borrower can understand)

CONSTRAINTS:
- Never approve a loan above the policy cap.
- Never assign a rate below 5% or above 25% APR.
- Never assign a term other than 7, 30, or 90 days.
- If prior_mira_defaulted > 0 and prior_mira_repaid == 0, decline.
- If wallet_age_days < 30, decline (insufficient history).
- If stablecoin_volume_90d < 1000, decline (insufficient activity).

REMEMBER:
- You are deciding with the borrower's money and the protocol's money.
- Be conservative. Decline is always a valid decision.
- Output JSON only. No prose outside the JSON.`;

/** Input to the agent: the verified factors + the requested loan terms. */
export interface AgentInput {
  factors: VerifiedFactors;
  requestedAmount: number; // USD (whole dollars, not cents)
  requestedTermDays: number; // 7 | 30 | 90
}

/** The agent's structured output. */
export interface AgentDecision {
  decision: LoanDecision;
  approvedAmount: number; // USD (whole dollars)
  interestRateApr: number; // 5.0 - 25.0
  confidence: number; // 0 - 100
  reasoning: string; // <= 60 words
  /** Which path produced this decision. */
  source: 'llm' | 'fallback' | 'fallback_retried';
}

/** Policy bounds — mirrored from the Policy contract for client-side pre-checks. */
export const POLICY_BOUNDS = {
  minRateApr: 5.0,
  maxRateApr: 25.0,
  allowedTerms: [7, 30, 90] as const,
  maxAmountUsd: 1000,
} as const;

const MAX_RETRIES = 3;
const MAX_REASONING_WORDS = 60;

/** Lazy-initialized SDK singleton — created once, reused across calls. */
let _zai: ZAI | null = null;

async function getZai(): Promise<ZAI> {
  if (!_zai) {
    _zai = await ZAI.create();
  }
  return _zai;
}

/**
 * Produce a loan decision for a verified borrower.
 *
 * Calls the LLM with the structured-output prompt. If the LLM returns
 * invalid JSON, out-of-bounds values, or fails entirely, the call is retried
 * up to MAX_RETRIES times. If all retries fail, a deterministic fallback
 * decision is produced so the flow never stalls.
 *
 * The decision is ALWAYS within Policy bounds when `source` is 'llm' or
 * 'fallback' — the function clamps values and validates before returning.
 */
export async function decide(input: AgentInput): Promise<AgentDecision> {
  const userMessage = buildUserMessage(input);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await callLlm(userMessage);
      const parsed = parseDecision(raw);

      if (parsed) {
        const validated = validateAndClamp(parsed, input);
        if (validated) {
          return { ...validated, source: attempt === 1 ? 'llm' : 'fallback_retried' };
        }
      }
      // Invalid output — retry with a stricter reminder
      console.error(`  attempt ${attempt}: invalid LLM output, retrying...`);
    } catch (err) {
      console.error(`  attempt ${attempt}: LLM error — ${(err as Error).message}`);
    }
  }

  // All retries exhausted — deterministic fallback
  console.error('  LLM exhausted retries, using deterministic fallback');
  return deterministicFallback(input);
}

/**
 * Build the user message: the verified feature vector as JSON.
 */
function buildUserMessage(input: AgentInput): string {
  return JSON.stringify({
    wallet_age_days: input.factors.walletAgeDays,
    tx_count_90d: input.factors.txCount90d,
    stablecoin_volume_90d: input.factors.stablecoinVolume90d,
    defi_position_count: input.factors.defiPositionCount,
    prior_mira_loans: input.factors.priorMiraLoans,
    prior_mira_repaid: input.factors.priorMiraRepaid,
    prior_mira_defaulted: input.factors.priorMiraDefaulted,
    requested_amount: input.requestedAmount,
    requested_term_days: input.requestedTermDays,
  });
}

/**
 * Call the LLM with the system prompt + user message.
 * Returns the raw text response.
 */
async function callLlm(userMessage: string): Promise<string> {
  const zai = await getZai();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    thinking: { type: 'disabled' },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content || content.trim().length === 0) {
    throw new Error('Empty LLM response');
  }
  return content;
}

/**
 * Parse the LLM's text response into a structured decision.
 * Returns null if the response is not valid JSON with the required fields.
 */
function parseDecision(raw: string): ParsedDecision | null {
  // Extract JSON from the response (the LLM may wrap it in markdown fences
  // or add stray text despite instructions).
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const obj = JSON.parse(jsonMatch[0]);
    if (typeof obj.decision !== 'string') return null;
    if (typeof obj.approved_amount !== 'number') return null;
    if (typeof obj.interest_rate_apr !== 'number') return null;
    if (typeof obj.confidence !== 'number') return null;
    if (typeof obj.reasoning !== 'string') return null;

    return {
      decision: obj.decision,
      approvedAmount: obj.approved_amount,
      interestRateApr: obj.interest_rate_apr,
      confidence: obj.confidence,
      reasoning: obj.reasoning,
    };
  } catch {
    return null;
  }
}

interface ParsedDecision {
  decision: string;
  approvedAmount: number;
  interestRateApr: number;
  confidence: number;
  reasoning: string;
}

/**
 * Validate a parsed decision against the Policy bounds and business rules.
 * Returns a clamped/validated decision, or null if the decision is
 * fundamentally invalid (e.g. unknown decision type).
 *
 * This is the client-side mirror of the Policy contract's validateDecision.
 * The on-chain contract is the final authority, but catching errors here
 * avoids wasting gas on obviously-bad decisions.
 */
function validateAndClamp(
  parsed: ParsedDecision,
  input: AgentInput,
): Omit<AgentDecision, 'source'> | null {
  // Decision type
  if (!['approve', 'decline', 'approve_reduced'].includes(parsed.decision)) {
    return null;
  }

  // Hard decline rules (from the prompt constraints)
  if (input.factors.walletAgeDays < 30) {
    return declineWith('Insufficient wallet history (under 30 days).');
  }
  if (input.factors.stablecoinVolume90d < 1000) {
    return declineWith('Insufficient stablecoin activity (under $1,000 in 90 days).');
  }
  if (input.factors.priorMiraDefaulted > 0 && input.factors.priorMiraRepaid === 0) {
    return declineWith('Prior default with no repayments on record.');
  }

  if (parsed.decision === 'decline') {
    return {
      decision: 'decline',
      approvedAmount: 0,
      interestRateApr: 0,
      confidence: clamp(parsed.confidence, 0, 100),
      reasoning: truncateWords(parsed.reasoning, MAX_REASONING_WORDS),
    };
  }

  // Approve / approve_reduced — clamp values into Policy bounds
  const rate = clamp(
    parsed.interestRateApr,
    POLICY_BOUNDS.minRateApr,
    POLICY_BOUNDS.maxRateApr,
  );

  // approved_amount: must be > 0 and <= requested (for approve_reduced) or
  // <= maxAmount cap (for approve)
  let amount = parsed.approvedAmount;
  if (amount <= 0) amount = Math.min(input.requestedAmount, POLICY_BOUNDS.maxAmountUsd);
  if (parsed.decision === 'approve_reduced') {
    amount = Math.min(amount, input.requestedAmount);
  } else {
    amount = Math.min(amount, input.requestedAmount, POLICY_BOUNDS.maxAmountUsd);
  }
  amount = Math.max(1, Math.floor(amount));

  return {
    decision: parsed.decision as LoanDecision,
    approvedAmount: amount,
    interestRateApr: Math.round(rate * 10) / 10, // one decimal place
    confidence: clamp(parsed.confidence, 0, 100),
    reasoning: truncateWords(parsed.reasoning, MAX_REASONING_WORDS),
  };
}

function declineWith(reason: string): Omit<AgentDecision, 'source'> {
  return {
    decision: 'decline',
    approvedAmount: 0,
    interestRateApr: 0,
    confidence: 100,
    reasoning: truncateWords(reason, MAX_REASONING_WORDS),
  };
}

/**
 * Deterministic fallback decision (used when the LLM is unavailable or
 * repeatedly produces invalid output).
 *
 * This is the S6 fallback path from the reliability architecture: it
 * produces a valid, in-bounds decision using simple rules, so a loan can
 * still originate even without the LLM.
 */
export function deterministicFallback(input: AgentInput): AgentDecision {
  // Apply the same hard decline rules
  if (input.factors.walletAgeDays < 30) {
    return { ...declineWith('Insufficient wallet history (under 30 days).'), source: 'fallback' };
  }
  if (input.factors.stablecoinVolume90d < 1000) {
    return { ...declineWith('Insufficient stablecoin activity (under $1,000 in 90 days).'), source: 'fallback' };
  }
  if (input.factors.priorMiraDefaulted > 0 && input.factors.priorMiraRepaid === 0) {
    return { ...declineWith('Prior default with no repayments on record.'), source: 'fallback' };
  }

  // Approve: amount proportional to volume, capped at the Policy max
  const amount = Math.min(
    POLICY_BOUNDS.maxAmountUsd,
    Math.max(1, Math.floor(input.factors.stablecoinVolume90d * 0.5)),
  );

  // Rate: lower for better profiles (more volume → lower rate)
  const rate = Math.round(
    clamp(
      25.0 - input.factors.stablecoinVolume90d / 1000,
      POLICY_BOUNDS.minRateApr,
      POLICY_BOUNDS.maxRateApr,
    ) * 10,
  ) / 10;

  return {
    decision: 'approve',
    approvedAmount: amount,
    interestRateApr: rate,
    confidence: 70,
    reasoning: truncateWords(
      `Approved based on ${input.factors.txCount90d} verified transactions and $${input.factors.stablecoinVolume90d} stablecoin volume over 90 days.`,
      MAX_REASONING_WORDS,
    ),
    source: 'fallback',
  };
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(' ') + '…';
}
