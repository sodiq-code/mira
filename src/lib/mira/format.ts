/**
 * Shared formatters for MIRA's UI.
 *
 * The amount formatter exists to harden against the "<$100" rendering bug:
 * loan amounts come from on-chain reads (BigInt → Number(cents) / 100) and
 * from LLM JSON, and either path can hand the UI a non-number (NaN, a string
 * like "<$100" if the LLM hallucinated, undefined, etc). The formatter
 * coerces to a number, falls back to 0, and always emits a clean "$X" or
 * "$X.YY" string so a malformed upstream value never leaks into the DOM as
 * a literal "<$100".
 */

/**
 * Format a USD amount. Whole-dollar amounts render as "$100"; fractional
 * amounts render with two decimals ("$100.50"). Non-numeric input renders
 * as "$0.00" rather than "$NaN" / "$undefined" / the raw string.
 */
export function formatUsd(amount: unknown): string {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return '$0.00';
  // Render whole dollars without decimals for cleaner tables; anything
  // fractional gets two decimals so the cents are visible.
  if (Number.isInteger(n) && Math.abs(n) < 1_000_000) {
    return `$${n}`;
  }
  return `$${n.toFixed(2)}`;
}

/**
 * Format a USD amount always with two decimals — used in summaries and
 * callouts where the cents matter (e.g. principal + interest).
 */
export function formatUsdFixed(amount: unknown): string {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}
