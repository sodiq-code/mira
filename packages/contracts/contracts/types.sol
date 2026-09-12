// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Lifecycle states for a MIRA loan.
 *
 *   Pending    — created but not yet originated (transient; not used in MVP)
 *   Originated — active; funds are notionally disbursed; awaiting repayment or default
 *   Repaid     — terminal; borrower fulfilled the obligation
 *   Defaulted  — terminal; due block passed without repayment
 *
 * Only Originated → Repaid and Originated → Defaulted transitions are legal,
 * and both are restricted to the worker role.
 */
enum LoanStatus {
    Pending,
    Originated,
    Repaid,
    Defaulted
}

/**
 * A credit decision produced by the agent (LLM or deterministic fallback)
 * and validated against the Policy contract before origination.
 *
 * All monetary values are in USD-denominated units (1 unit = 1 USD cent for
 * integer safety). Rate is in basis points (50 = 0.50%, 2500 = 25.00%).
 */
struct Decision {
    address borrower;
    uint256 amount;      // USD cents
    uint256 rate;        // basis points (bps)
    uint256 term;        // days (7 | 30 | 90)
    uint256 nonce;       // borrower's expected nonce (origination ordering; stale-decision protection is via expiresAtBlock)
    uint256 expiresAtBlock;  // block after which this decision is stale
    bytes32 evidenceHash;     // keccak256 of the verified evidence (non-zero)
}
