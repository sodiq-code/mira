// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Decision, LoanStatus} from "./types.sol";
import {AgentReputation} from "./AgentReputation.sol";
import {BorrowerReputation} from "./BorrowerReputation.sol";
import {LiquidityPool} from "./LiquidityPool.sol";

/**
 * Policy — the on-chain bounds that every agent decision must satisfy.
 *
 * This is a singleton: one deployed instance governs all loans. The bounds
 * are governance-gated — the worker (which originates loans) cannot change
 * them, so a compromised worker key cannot loosen the rules to approve bad
 * loans. Only the governance address can update the policy.
 *
 * The bounds come from the agent's prompt constraints:
 *   - rate: 5.00% – 25.00% APR  →  500 – 2500 bps
 *   - terms: 7, 30, or 90 days
 *   - max amount: configurable (default $1,000 = 100,000 cents)
 *
 * Agent-authority tier ladder: the agent's reputation score determines the
 * maximum loan it is trusted to originate. A fresh agent (score 500) can
 * only lend $25; a proven agent (score 850+) can lend up to $2,500. This
 * makes the agent's track record load-bearing — not a decorative number.
 *
 * Tier ladder:
 *   score < 500  →  $0     (cannot lend — unproven)
 *   500 – 649    →  $25    (2,500 cents)
 *   650 – 749    →  $100   (10,000 cents)
 *   750 – 849    →  $500   (50,000 cents)
 *   ≥ 850        →  $2,500 (250,000 cents)
 */
contract Policy {
    // ─── Roles ──────────────────────────────────────────────────────────

    address public governance;
    address public worker;

    // ─── Dependencies (set after deployment) ────────────────────────────

    AgentReputation public agentReputation;
    BorrowerReputation public borrowerReputation;
    LiquidityPool public liquidityPool;

    // ─── Bounds ────────────────────────────────────────────────────────

    uint256 public maxLoanAmount;   // USD cents — global ceiling
    uint256 public minRate;         // bps
    uint256 public maxRate;         // bps
    uint256[] public allowedTerms;  // days

    bool public paused;

    // ─── Version (for decision receipts) ────────────────────────────────

    uint256 public version;

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
    event DependenciesSet(address agentReputation, address borrowerReputation, address liquidityPool);

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
        version = 1;
    }

    // ─── Dependency wiring ─────────────────────────────────────────────

    /**
     * Set the contracts Policy reads during validation. Called once after
     * all contracts are deployed. Governance-only.
     */
    function setDependencies(
        address _agentReputation,
        address _borrowerReputation,
        address _liquidityPool
    ) external onlyGovernance {
        agentReputation = AgentReputation(_agentReputation);
        borrowerReputation = BorrowerReputation(_borrowerReputation);
        liquidityPool = LiquidityPool(_liquidityPool);
        emit DependenciesSet(_agentReputation, _borrowerReputation, _liquidityPool);
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
        version++;
        emit PolicyUpdated(_maxLoanAmount, _minRate, _maxRate, msg.sender, block.number);
    }

    function setWorker(address _worker) external onlyGovernance {
        emit WorkerSet(worker, _worker);
        worker = _worker;
    }

    function setPaused(bool _paused) external {
        // Callable by governance OR by AgentReputation (auto-pause on
        // serious failure). The AgentReputation contract calls this when
        // cumulativeDefaulted reaches the serious-failure threshold.
        require(
            msg.sender == governance || msg.sender == address(agentReputation),
            "Policy: not authorized to pause"
        );
        paused = _paused;
        emit PausedToggle(_paused);
    }

    // ─── Agent-authority tier ladder ───────────────────────────────────

    /**
     * The maximum loan amount the agent is authorized to originate, based
     * on its current reputation score. This is the "skin in the game"
     * mechanism: a fresh agent can only lend small amounts; a proven agent
     * with a strong repayment record can lend more.
     *
     * Tier ladder:
     *   score < 500  →  $0     (cannot lend)
     *   500 – 649    →  $25    (2,500 cents)
     *   650 – 749    →  $100   (10,000 cents)
     *   750 – 849    →  $500   (50,000 cents)
     *   ≥ 850        →  $2,500 (250,000 cents)
     *
     * The tier cap is always floored at maxLoanAmount (the global ceiling)
     * so the tier never exceeds what governance has set.
     */
    function agentTierCap(uint256 score) public pure returns (uint256) {
        if (score < 500) return 0;            // unproven — cannot lend
        if (score < 650) return 2_500;        // $25
        if (score < 750) return 10_000;       // $100
        if (score < 850) return 50_000;       // $500
        return 250_000;                       // $2,500
    }

    function currentAgentCap() public view returns (uint256) {
        uint256 tierCap = agentTierCap(agentReputation.currentScore());
        return tierCap < maxLoanAmount ? tierCap : maxLoanAmount;
    }

    // ─── Validation ────────────────────────────────────────────────────

    /**
     * Validate a decision against the on-chain policy bounds.
     *
     * Returns true when every constraint is satisfied:
     *   - contract is not paused
     *   - amount > 0 and ≤ maxLoanAmount
     *   - amount ≤ agentTierCap (agent-authority check)
     *   - minRate ≤ rate ≤ maxRate
     *   - term is in the allowed set
     *   - sufficient liquidity in the pool
     *
     * This is a view function — it does not revert on failure, it returns
     * false, so the caller can branch on the result.
     */
    function validateDecision(Decision memory d) external view returns (bool) {
        if (paused) return false;
        if (d.amount == 0 || d.amount > maxLoanAmount) return false;

        // Agent-authority check: the agent's reputation score gates its
        // lending capacity. A fresh agent cannot originate a $500 loan.
        uint256 cap = agentTierCap(agentReputation.currentScore());
        if (d.amount > cap) return false;

        if (d.rate < minRate || d.rate > maxRate) return false;

        bool termAllowed = false;
        for (uint256 i = 0; i < allowedTerms.length; i++) {
            if (allowedTerms[i] == d.term) {
                termAllowed = true;
                break;
            }
        }
        if (!termAllowed) return false;

        // Liquidity check: the pool must have enough available capital.
        if (address(liquidityPool) != address(0)) {
            if (d.amount > liquidityPool.available()) return false;
        }

        return true;
    }

    /// Convenience accessor that returns the full terms array in one call.
    function getAllowedTerms() external view returns (uint256[] memory) {
        return allowedTerms;
    }
}
