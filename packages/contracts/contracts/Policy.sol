// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Decision, LoanStatus} from "./types.sol";

/**
 * Policy — the on-chain bounds that every agent decision must satisfy.
 *
 * This is a singleton: one deployed instance governs all loans. The bounds
 * are governance-gated — the worker (which originates loans) cannot change
 * them, so a compromised worker key cannot loosen the rules to approve bad
 * loans. Only the governance address can update the policy.
 *
 * The bounds come from the agent's prompt constraints (Section 25.4):
 *   - rate: 5.00% – 25.00% APR  →  500 – 2500 bps
 *   - terms: 7, 30, or 90 days
 *   - max amount: configurable (default $1,000 = 100,000 cents)
 */
contract Policy {
    // ─── Roles ──────────────────────────────────────────────────────────

    address public governance;
    /// The worker address that originates loans. Read-only for validation.
    address public worker;

    // ─── Bounds ────────────────────────────────────────────────────────

    uint256 public maxLoanAmount;   // USD cents
    uint256 public minRate;         // bps
    uint256 public maxRate;         // bps
    uint256[] public allowedTerms;  // days

    bool public paused;

    // ─── Events ────────────────────────────────────────────────────────

    event PolicyUpdated(
        uint256 newMaxLoanAmount,
        uint256 newMinRate,
        uint256 newMaxRate,
        address updatedBy,
        uint256 blockNumber
    );
    event WorkerSet(address indexed oldWorker, address indexed newWorker);
    event PausedToggle(bool paused);

    // ─── Modifiers ─────────────────────────────────────────────────────

    modifier onlyGovernance() {
        require(msg.sender == governance, "Policy: caller is not governance");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Policy: paused");
        _;
    }

    // ─── Constructor ───────────────────────────────────────────────────

    constructor(
        address _governance,
        address _worker,
        uint256 _maxLoanAmount,
        uint256 _minRate,
        uint256 _maxRate,
        uint256[] memory _allowedTerms
    ) {
        require(_governance != address(0), "Policy: governance is zero address");
        require(_minRate <= _maxRate, "Policy: minRate > maxRate");
        require(_allowedTerms.length > 0, "Policy: no allowed terms");
        governance = _governance;
        worker = _worker;
        maxLoanAmount = _maxLoanAmount;
        minRate = _minRate;
        maxRate = _maxRate;
        allowedTerms = _allowedTerms;
    }

    // ─── Governance ────────────────────────────────────────────────────

    function updateBounds(
        uint256 _maxLoanAmount,
        uint256 _minRate,
        uint256 _maxRate,
        uint256[] memory _allowedTerms
    ) external onlyGovernance {
        require(_minRate <= _maxRate, "Policy: minRate > maxRate");
        require(_allowedTerms.length > 0, "Policy: no allowed terms");
        maxLoanAmount = _maxLoanAmount;
        minRate = _minRate;
        maxRate = _maxRate;
        allowedTerms = _allowedTerms;
        emit PolicyUpdated(_maxLoanAmount, _minRate, _maxRate, msg.sender, block.number);
    }

    function setWorker(address _worker) external onlyGovernance {
        emit WorkerSet(worker, _worker);
        worker = _worker;
    }

    function setPaused(bool _paused) external onlyGovernance {
        paused = _paused;
        emit PausedToggle(_paused);
    }

    // ─── Validation ────────────────────────────────────────────────────

    /**
     * Validate a decision against the on-chain policy bounds.
     *
     * Returns true when every constraint is satisfied:
     *   - contract is not paused
     *   - amount > 0 and ≤ maxLoanAmount
     *   - minRate ≤ rate ≤ maxRate
     *   - term is in the allowed set
     *
     * This is a pure view function — it does not revert on failure, it
     * returns false, so the caller can branch on the result. The Loan
     * contract calls this before origination and reverts with a reason
     * if it returns false, giving the worker a clear error path.
     */
    function validateDecision(Decision memory d) external view returns (bool) {
        if (paused) return false;
        if (d.amount == 0 || d.amount > maxLoanAmount) return false;
        if (d.rate < minRate || d.rate > maxRate) return false;

        bool termAllowed = false;
        for (uint256 i = 0; i < allowedTerms.length; i++) {
            if (allowedTerms[i] == d.term) {
                termAllowed = true;
                break;
            }
        }
        if (!termAllowed) return false;

        return true;
    }

    /// Convenience accessor that returns the full terms array in one call.
    function getAllowedTerms() external view returns (uint256[] memory) {
        return allowedTerms;
    }
}
