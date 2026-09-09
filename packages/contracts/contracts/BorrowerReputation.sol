// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * BorrowerReputation — per-borrower repaid/defaulted counts.
 *
 * One record per borrower address (lazy-created on first loan). This is the
 * on-chain memory that lets MIRA factor prior history into future decisions
 * without trusting any off-chain assertion.
 *
 * Like AgentReputation, only the Loan contract or the worker may update it.
 */
contract BorrowerReputation {
    // ─── Roles ──────────────────────────────────────────────────────────

    address public worker;
    address public loanContract;

    // ─── State ──────────────────────────────────────────────────────────

    struct Record {
        uint256 loanCount;
        uint256 repaidCount;
        uint256 defaultedCount;
        uint256 firstLoanBlock;
        bool exists;
    }

    mapping(address => Record) private records;

    // ─── Events ────────────────────────────────────────────────────────

    event BorrowerReputationUpdated(
        address indexed borrower,
        uint256 repaidCount,
        uint256 defaultedCount,
        uint256 blockNumber
    );

    // ─── Modifiers ─────────────────────────────────────────────────────

    modifier onlyAuthorized() {
        require(
            msg.sender == worker || msg.sender == loanContract,
            "BorrowerReputation: not authorized"
        );
        _;
    }

    // ─── Constructor ───────────────────────────────────────────────────

    constructor(address _worker) {
        require(_worker != address(0), "BorrowerReputation: worker is zero address");
        worker = _worker;
    }

    // ─── Configuration ─────────────────────────────────────────────────

    function setLoanContract(address _loanContract) external {
        require(msg.sender == worker, "BorrowerReputation: not worker");
        loanContract = _loanContract;
    }

    // ─── Recording ─────────────────────────────────────────────────────

    function recordLoan(address borrower, uint256 /* loanId */) external onlyAuthorized {
        Record storage r = records[borrower];
        if (!r.exists) {
            r.exists = true;
            r.firstLoanBlock = block.number;
        }
        r.loanCount += 1;
        emit BorrowerReputationUpdated(borrower, r.repaidCount, r.defaultedCount, block.number);
    }

    function recordRepaid(address borrower) external onlyAuthorized {
        Record storage r = records[borrower];
        require(r.exists, "BorrowerReputation: borrower has no loans");
        r.repaidCount += 1;
        emit BorrowerReputationUpdated(borrower, r.repaidCount, r.defaultedCount, block.number);
    }

    function recordDefaulted(address borrower) external onlyAuthorized {
        Record storage r = records[borrower];
        require(r.exists, "BorrowerReputation: borrower has no loans");
        r.defaultedCount += 1;
        emit BorrowerReputationUpdated(borrower, r.repaidCount, r.defaultedCount, block.number);
    }

    // ─── Reads ─────────────────────────────────────────────────────────

    function getReputation(address borrower)
        external
        view
        returns (uint256 repaid, uint256 defaulted)
    {
        Record storage r = records[borrower];
        return (r.repaidCount, r.defaultedCount);
    }

    function getFullReputation(address borrower)
        external
        view
        returns (
            uint256 loanCount,
            uint256 repaidCount,
            uint256 defaultedCount,
            uint256 firstLoanBlock,
            bool exists
        )
    {
        Record storage r = records[borrower];
        return (r.loanCount, r.repaidCount, r.defaultedCount, r.firstLoanBlock, r.exists);
    }
}
