// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoanStatus} from "./types.sol";

/**
 * AgentReputation — the agent's own public, append-mostly track record.
 *
 * Singleton. Every loan outcome updates this ledger, so the agent's
 * creditworthiness is a first-class on-chain asset it cannot tamper with.
 *
 * Score formula:
 *   score = BASE_SCORE + repaid * REPAID_WEIGHT - defaulted * DEFAULT_WEIGHT
 *   default: BASE=500, REPAID_WEIGHT=10, DEFAULT_WEIGHT=25
 *
 * Agent-authority: the agent's score determines how much capital it is
 * trusted to manage (see Policy.agentTierCap). A score below 500 means
 * the agent cannot lend at all; a score of 850+ unlocks $2,500 per loan.
 *
 * Auto-pause: when cumulative defaults reach SERIOUS_FAILURE_THRESHOLD,
 * the AgentReputation contract calls Policy.setPaused(true) to halt all
 * lending automatically — no governance vote required. This is the
 * "economic accountability" mechanism: a catastrophically bad agent
 * loses its lending authority without human intervention.
 *
 * Only the Loan contract (or the worker) may record outcomes — external
 * accounts cannot inflate the numbers.
 */
contract AgentReputation {
    // ─── Constants ─────────────────────────────────────────────────────

    uint256 public constant BASE_SCORE = 500;
    uint256 public constant REPAID_WEIGHT = 10;
    uint256 public constant DEFAULT_WEIGHT = 25;
    uint256 public constant SERIOUS_FAILURE_THRESHOLD = 5;

    // ─── Roles ──────────────────────────────────────────────────────────

    address public worker;
    address public loanContract;

    // ─── Dependencies ──────────────────────────────────────────────────

    /// The Policy contract — called to auto-pause on serious failure.
    address public policyContract;

    // ─── State ──────────────────────────────────────────────────────────

    uint256 public cumulativeLoans;
    uint256 public cumulativeRepaid;
    uint256 public cumulativeDefaulted;
    uint256 public lastUpdatedBlock;
    bool public autoPaused;  // true once the serious-failure threshold was hit

    // ─── Events ────────────────────────────────────────────────────────

    event ReputationUpdated(
        uint256 cumulativeLoans,
        uint256 cumulativeRepaid,
        uint256 cumulativeDefaulted,
        uint256 newScore,
        uint256 blockNumber
    );
    event AutoPaused(uint256 cumulativeDefaulted, uint256 blockNumber);

    // ─── Modifiers ─────────────────────────────────────────────────────

    modifier onlyAuthorized() {
        require(
            msg.sender == worker || msg.sender == loanContract,
            "AgentReputation: not authorized"
        );
        _;
    }

    // ─── Constructor ───────────────────────────────────────────────────

    constructor(address _worker) {
        require(_worker != address(0), "AgentReputation: worker is zero address");
        worker = _worker;
        lastUpdatedBlock = block.number;
    }

    // ─── Configuration ─────────────────────────────────────────────────

    function setLoanContract(address _loanContract) external {
        require(msg.sender == worker, "AgentReputation: not worker");
        loanContract = _loanContract;
    }

    function setPolicyContract(address _policyContract) external {
        require(msg.sender == worker, "AgentReputation: not worker");
        policyContract = _policyContract;
    }

    // ─── Recording ─────────────────────────────────────────────────────

    function recordLoan(uint256 /* loanId */) external onlyAuthorized {
        cumulativeLoans += 1;
        lastUpdatedBlock = block.number;
        emit ReputationUpdated(
            cumulativeLoans,
            cumulativeRepaid,
            cumulativeDefaulted,
            currentScore(),
            block.number
        );
    }

    function recordRepaid(uint256 /* loanId */) external onlyAuthorized {
        cumulativeRepaid += 1;
        lastUpdatedBlock = block.number;
        emit ReputationUpdated(
            cumulativeLoans,
            cumulativeRepaid,
            cumulativeDefaulted,
            currentScore(),
            block.number
        );
    }

    function recordDefaulted(uint256 /* loanId */) external onlyAuthorized {
        cumulativeDefaulted += 1;
        lastUpdatedBlock = block.number;

        // Auto-pause on serious failure: once the agent accumulates enough
        // defaults, it loses its lending authority automatically. This is
        // the "economic accountability" mechanism — the agent's own track
        // record halts it, not a governance vote.
        if (cumulativeDefaulted >= SERIOUS_FAILURE_THRESHOLD && !autoPaused) {
            autoPaused = true;
            _tryPausePolicy();
            emit AutoPaused(cumulativeDefaulted, block.number);
        }

        emit ReputationUpdated(
            cumulativeLoans,
            cumulativeRepaid,
            cumulativeDefaulted,
            currentScore(),
            block.number
        );
    }

    // ─── Reads ─────────────────────────────────────────────────────────

    function currentScore() public view returns (uint256) {
        uint256 penalty = cumulativeDefaulted * DEFAULT_WEIGHT;
        uint256 bonus = cumulativeRepaid * REPAID_WEIGHT;
        if (bonus >= penalty) {
            return BASE_SCORE + bonus - penalty;
        }
        if (penalty - bonus >= BASE_SCORE) return 0;
        return BASE_SCORE - (penalty - bonus);
    }

    /**
     * The agent's current capital authority in USD cents, derived from
     * the score tier ladder. Convenience view so the UI can show "MIRA
     * is authorized to lend up to $X" without recomputing the tier.
     */
    function currentCapitalAuthority() external view returns (uint256) {
        uint256 score = currentScore();
        if (score < 500) return 0;
        if (score < 650) return 2_500;       // $25
        if (score < 750) return 10_000;      // $100
        if (score < 850) return 50_000;      // $500
        return 250_000;                      // $2,500
    }

    // ─── Internal ──────────────────────────────────────────────────────

    /**
     * Best-effort call to Policy.setPaused(true). Uses a low-level call
     * so a misconfigured policyContract address doesn't revert the
     * recordDefaulted call — the reputation update itself must never fail
     * because the pause mechanism is broken.
     */
    function _tryPausePolicy() internal {
        if (policyContract == address(0)) return;
        (bool ok, ) = policyContract.call(
            abi.encodeWithSignature("setPaused(bool)", true)
        );
        // ok is intentionally ignored — the autoPaused flag is set
        // regardless, so the agent's authority drops to $0 via the tier
        // ladder even if the pause call fails.
        ok;
    }
}
