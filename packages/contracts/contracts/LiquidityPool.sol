// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * LiquidityPool — the protocol's lending capital.
 *
 * Singleton. In the MVP, the protocol itself is the lender: deposits come
 * from the governance address (or demo funder), and loans draw against
 * the pool. The utilization rate is a read-only metric that the agent can
 * factor into future decisions (e.g. decline when utilization is too high).
 *
 * This contract is intentionally simple for the hackathon — it tracks
 * deposits, outstanding loans, and utilization. It does not manage LP
 * tokens or yield distribution yet (those are post-hackathon).
 */
contract LiquidityPool {
    // ─── Roles ──────────────────────────────────────────────────────────

    address public worker;
    address public governance;

    // ─── State ──────────────────────────────────────────────────────────

    uint256 public totalDeposits;      // USD cents
    uint256 totalOutstanding;          // USD cents (private, exposed via getter)
    uint256 public lpTokens;           // placeholder for future LP accounting

    // ─── Events ────────────────────────────────────────────────────────

    event Deposited(address indexed from, uint256 amount, uint256 newTotal);
    event Withdrawn(address indexed to, uint256 amount, uint256 newTotal);
    event LoanFunded(uint256 indexed loanId, uint256 amount, uint256 newOutstanding);
    event LoanRepaidToPool(uint256 indexed loanId, uint256 amount, uint256 newOutstanding);

    // ─── Modifiers ─────────────────────────────────────────────────────

    modifier onlyWorker() {
        require(msg.sender == worker, "LiquidityPool: not worker");
        _;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "LiquidityPool: not governance");
        _;
    }

    // ─── Constructor ───────────────────────────────────────────────────

    constructor(address _governance, address _worker) {
        require(_governance != address(0), "LiquidityPool: governance is zero address");
        governance = _governance;
        worker = _worker;
    }

    function setWorker(address _worker) external onlyGovernance {
        worker = _worker;
    }

    // ─── Capital management ────────────────────────────────────────────

    function deposit(uint256 amount) external onlyGovernance {
        require(amount > 0, "LiquidityPool: zero deposit");
        totalDeposits += amount;
        emit Deposited(msg.sender, amount, totalDeposits);
    }

    function withdraw(uint256 amount) external onlyGovernance {
        require(amount <= totalDeposits - totalOutstanding, "LiquidityPool: exceeds available");
        totalDeposits -= amount;
        emit Withdrawn(msg.sender, amount, totalDeposits);
    }

    // ─── Loan funding ──────────────────────────────────────────────────

    /**
     * Called by the Loan contract (via the worker) when a loan is
     * originated. Moves capital from deposits to outstanding.
     */
    function fundLoan(uint256 loanId, uint256 amount) external onlyWorker {
        require(amount <= available(), "LiquidityPool: insufficient liquidity");
        totalOutstanding += amount;
        emit LoanFunded(loanId, amount, totalOutstanding);
    }

    /**
     * Called by the worker when a loan is repaid. Returns capital to
     * the pool.
     */
    function repayToPool(uint256 loanId, uint256 amount) external onlyWorker {
        require(amount <= totalOutstanding, "LiquidityPool: over-repayment");
        totalOutstanding -= amount;
        emit LoanRepaidToPool(loanId, amount, totalOutstanding);
    }

    // ─── Reads ─────────────────────────────────────────────────────────

    function getTotalOutstanding() external view returns (uint256) {
        return totalOutstanding;
    }

    function available() public view returns (uint256) {
        return totalDeposits - totalOutstanding;
    }

    /// Utilization rate in basis points (0–10000). 0% = no loans out,
    /// 100% = all capital deployed.
    function utilization() external view returns (uint256) {
        if (totalDeposits == 0) return 0;
        return (totalOutstanding * 10000) / totalDeposits;
    }
}
