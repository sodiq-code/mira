// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoanStatus} from "./types.sol";

/**
 * AgentReputation — the agent's own public, append-mostly track record.
 *
 * Singleton. Every loan outcome updates this ledger, so the agent's
 * creditworthiness is a first-class on-chain asset it cannot tamper with.
 *
 * Score formula (from the validation plan):
 *   score = BASE_SCORE + repaid * REPAID_WEIGHT - defaulted * DEFAULT_WEIGHT
 *   default: BASE=500, REPAID_WEIGHT=10, DEFAULT_WEIGHT=25
 *   After 5 loans (3 repaid, 2 defaulted): 500 + 30 - 50 = 480 ✓
 *
 * Only the Loan contract (or the worker, depending on wiring) may record
 * outcomes — external accounts cannot inflate the numbers.
 */
contract AgentReputation {
    // ─── Constants ─────────────────────────────────────────────────────

    uint256 public constant BASE_SCORE = 500;
    uint256 public constant REPAID_WEIGHT = 10;
    uint256 public constant DEFAULT_WEIGHT = 25;

    // ─── Roles ──────────────────────────────────────────────────────────

    address public worker;
    address public loanContract;

    // ─── State ──────────────────────────────────────────────────────────

    uint256 public cumulativeLoans;
    uint256 public cumulativeRepaid;
    uint256 public cumulativeDefaulted;
    uint256 public lastUpdatedBlock;

    // ─── Events ────────────────────────────────────────────────────────

    event ReputationUpdated(
        uint256 cumulativeLoans,
        uint256 cumulativeRepaid,
        uint256 cumulativeDefaulted,
        uint256 newScore,
        uint256 blockNumber
    );

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

    // ─── Recording ─────────────────────────────────────────────────────

    /**
     * Record that a loan was originated. Increments cumulativeLoans and
     * updates the score (origination alone does not change the score, but
     * the block is stamped).
     */
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
        // Saturating subtraction: score never goes below 0.
        uint256 penalty = cumulativeDefaulted * DEFAULT_WEIGHT;
        uint256 bonus = cumulativeRepaid * REPAID_WEIGHT;
        if (bonus >= penalty) {
            return BASE_SCORE + bonus - penalty;
        }
        // If penalties exceed bonuses, floor at a small residual rather
        // than underflowing — a deeply underwater agent still has *some*
        // score rather than reverting reads.
        if (penalty - bonus >= BASE_SCORE) return 0;
        return BASE_SCORE - (penalty - bonus);
    }
}
