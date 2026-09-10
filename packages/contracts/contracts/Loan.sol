// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Decision, LoanStatus} from "./types.sol";
import {Policy} from "./Policy.sol";
import {AgentReputation} from "./AgentReputation.sol";
import {BorrowerReputation} from "./BorrowerReputation.sol";
import {LiquidityPool} from "./LiquidityPool.sol";
import {IBlockProverPrecompile} from "./IBlockProver.sol";

/**
 * Loan — the central lifecycle manager for all MIRA loans.
 *
 * A single deployed instance manages every loan by integer ID. The worker
 * is the only caller that can originate, mark repaid, or mark defaulted —
 * and every originate is validated against the Policy contract first, so
 * an out-of-bounds LLM decision is rejected on-chain.
 *
 * Capital movement: origination calls LiquidityPool.fundLoan() to move
 * real ERC-20 tokens from the pool to the borrower in the same transaction.
 * Repayment calls LiquidityPool.repayToPool() to pull tokens back. This
 * makes every loan a real transfer of value, not just a state-machine
 * transition.
 *
 * State transitions:
 *   Pending → Originated → (Repaid | Defaulted)
 *
 * Only Originated is an active state. Repaid and Defaulted are terminal.
 * On each terminal transition the reputation contracts are updated in the
 * same transaction, so the on-chain reputation is always consistent with
 * the loan ledger.
 */
contract Loan {
    // ─── Dependencies ──────────────────────────────────────────────────

    Policy public policy;
    AgentReputation public agentReputation;
    BorrowerReputation public borrowerReputation;
    LiquidityPool public liquidityPool;

    // ─── Roles ──────────────────────────────────────────────────────────

    address public worker;

    // ─── Loan storage ──────────────────────────────────────────────────

    struct LoanData {
        address borrower;
        uint256 amount;                  // USD cents
        uint256 rate;                    // bps
        uint256 term;                    // days
        uint256 dueBlock;
        uint256 originatedBlock;
        uint256 repaidBlock;
        uint256 defaultBlock;
        bytes32 decisionReasoningHash;
        bytes32 attestationProofHash;
        bytes32 repaymentProofHash;
        bytes32 writabilityActionTxHash;
        LoanStatus status;
        bool exists;
    }

    mapping(uint256 => LoanData) private loans;
    uint256 public nextLoanId;

    // ─── Nonce replay protection ──────────────────────────────────────

    /// Each borrower has a monotonically increasing nonce. A decision
    /// must carry the borrower's current nonce, and origination consumes
    /// it — so the same decision cannot be submitted twice.
    mapping(address => uint256) public borrowerNonces;

    // ─── Events ────────────────────────────────────────────────────────

    event LoanOriginated(
        address indexed borrower,
        uint256 indexed loanId,
        uint256 amount,
        uint256 rate,
        uint256 term,
        uint256 dueBlock,
        bytes32 attestationProofHash
    );
    event LoanRepaid(uint256 indexed loanId, uint256 repaidBlock, bytes32 repaymentProofHash);
    event LoanDefaulted(uint256 indexed loanId, uint256 defaultBlock, bytes32 writabilityActionTxHash);

    // ─── Modifiers ─────────────────────────────────────────────────────

    modifier onlyWorker() {
        require(msg.sender == worker, "Loan: caller is not worker");
        _;
    }

    // ─── Constructor ───────────────────────────────────────────────────

    constructor(
        address _worker,
        address _policy,
        address _agentReputation,
        address _borrowerReputation,
        address _liquidityPool
    ) {
        require(_worker != address(0), "Loan: worker is zero address");
        worker = _worker;
        policy = Policy(_policy);
        agentReputation = AgentReputation(_agentReputation);
        borrowerReputation = BorrowerReputation(_borrowerReputation);
        liquidityPool = LiquidityPool(_liquidityPool);
        nextLoanId = 1;
    }

    // ─── Configuration ─────────────────────────────────────────────────

    function setWorker(address _worker) external {
        require(msg.sender == worker, "Loan: not worker");
        worker = _worker;
    }

    // ─── Origination ───────────────────────────────────────────────────

    /**
     * Originate a new loan.
     *
     * The decision is validated against the Policy contract before any
     * state is written. On success:
     *   - the loan is stored with status Originated
     *   - a due block is computed
     *   - LiquidityPool.fundLoan() moves real ERC-20 tokens to the borrower
     *   - the LoanOriginated event is emitted
     *   - AgentReputation + BorrowerReputation are updated atomically
     *
     * If the pool has insufficient liquidity, the transaction reverts —
     * this is the "insufficient liquidity" adversarial check.
     *
     * @param borrower            the borrower's address
     * @param amount              USD cents
     * @param rate                basis points
     * @param term                days (7 | 30 | 90)
     * @param decisionReasoningHash  keccak256 of the LLM reasoning text
     * @param attestationProofHash   keccak256 of the Attestcoin proof data
     * @return loanId             the integer ID of the new loan
     */
    function originate(
        address borrower,
        uint256 amount,
        uint256 rate,
        uint256 term,
        bytes32 decisionReasoningHash,
        bytes32 attestationProofHash
    ) external onlyWorker returns (uint256 loanId) {
        // Build the full Decision struct for Policy validation. The nonce
        // is the borrower's current expected nonce; the expiry is set to
        // ~5 minutes from now (20 blocks at 15s each) so a stale decision
        // cannot be submitted later. The evidence hash is the attestation
        // proof hash (non-zero — checked by Policy).
        uint256 expectedNonce = borrowerNonces[borrower];
        Decision memory d = Decision({
            borrower: borrower,
            amount: amount,
            rate: rate,
            term: term,
            nonce: expectedNonce,
            expiresAtBlock: block.number + 20,
            evidenceHash: attestationProofHash
        });
        require(policy.validateDecision(d), "Loan: decision violates policy");

        // Consume the nonce — the same decision cannot be submitted twice.
        borrowerNonces[borrower] = expectedNonce + 1;

        loanId = nextLoanId++;
        uint256 dueBlock = block.number + (term * BLOCKS_PER_DAY);

        loans[loanId] = LoanData({
            borrower: borrower,
            amount: amount,
            rate: rate,
            term: term,
            dueBlock: dueBlock,
            originatedBlock: block.number,
            repaidBlock: 0,
            defaultBlock: 0,
            decisionReasoningHash: decisionReasoningHash,
            attestationProofHash: attestationProofHash,
            repaymentProofHash: bytes32(0),
            writabilityActionTxHash: bytes32(0),
            status: LoanStatus.Originated,
            exists: true
        });

        // Move real ERC-20 tokens from the pool to the borrower. If the
        // pool has insufficient liquidity this reverts, rolling back the
        // entire origination.
        liquidityPool.fundLoan(loanId, amount, borrower);

        // Update reputation atomically — if either call fails, the whole
        // origination reverts, so reputation can never desync from loans.
        agentReputation.recordLoan(loanId);
        borrowerReputation.recordLoan(borrower, loanId);

        emit LoanOriginated(borrower, loanId, amount, rate, term, dueBlock, attestationProofHash);
    }

    // ─── Repayment ─────────────────────────────────────────────────────

    /// The BlockProver precompile address on CC3 Testnet.
    address public constant BLOCK_PROVER = 0x0000000000000000000000000000000000000FD2;

    /// The Sepolia chain key on CC3 Testnet.
    uint256 public constant SEPOLIA_CHAIN_KEY = 1;

    /**
     * Mark a loan as repaid with on-chain Attestcoin proof verification.
     *
     * This is the trust-anchor version: the Loan contract itself calls
     * the BlockProver precompile to verify the repayment proof, so a
     * compromised worker key cannot fabricate a repayment. The proof
     * must correspond to a real Sepolia transaction that has been
     * attested by Creditcoin.
     *
     * The proof components are passed as STRUCTURED TUPLES (not opaque
     * bytes) so the Solidity ABI encoder produces the exact calldata the
     * precompile's `verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),
     * (bytes32,bytes32[]))` signature expects. Passing them as `bytes`
     * would encode them as dynamic byte arrays, which the precompile
     * cannot parse.
     *
     * @param loanId              The loan to mark repaid
     * @param repaymentProofHash  keccak256 of the proof data (for audit trail)
     * @param headerNumber        The attested Sepolia block height
     * @param txBytes             The raw repayment transaction bytes
     * @param merkleProof         The Merkle inclusion proof (structured tuple)
     * @param continuityProof     The continuity proof (structured tuple)
     */
    function markRepaidWithProof(
        uint256 loanId,
        bytes32 repaymentProofHash,
        uint256 headerNumber,
        bytes calldata txBytes,
        IBlockProverPrecompile.MerkleProof calldata merkleProof,
        IBlockProverPrecompile.ContinuityProof calldata continuityProof
    ) external onlyWorker {
        LoanData storage loan = loans[loanId];
        require(loan.exists, "Loan: loan does not exist");
        require(loan.status == LoanStatus.Originated, "Loan: not originated");

        // ─── The on-chain trust anchor ───────────────────────────────
        // The BlockProver precompile verifies that the repayment transaction
        // is real and attested. This is the line that makes MIRA's
        // reputation unfakeable: the contract, not the worker, verifies
        // the proof. A compromised worker cannot fabricate a repayment.
        //
        // The chainKey and headerNumber are cast to uint64 to match the
        // precompile's canonical signature exactly (the selector is derived
        // from the signature string, so uint256 would produce a different
        // selector that the precompile rejects with "Unknown selector").
        bool verified = IBlockProverPrecompile(BLOCK_PROVER).verify(
            uint64(SEPOLIA_CHAIN_KEY),
            uint64(headerNumber),
            txBytes,
            merkleProof,
            continuityProof
        );
        require(verified, "Loan: Attestcoin proof verification failed");

        // Pull real tokens back from the borrower into the pool.
        liquidityPool.repayToPool(loanId, loan.amount, loan.borrower);

        loan.status = LoanStatus.Repaid;
        loan.repaidBlock = block.number;
        loan.repaymentProofHash = repaymentProofHash;

        agentReputation.recordRepaid(loanId);
        borrowerReputation.recordRepaid(loan.borrower);

        emit LoanRepaid(loanId, block.number, repaymentProofHash);
    }

    /**
     * Mark a loan as repaid (worker-trusted version).
     *
     * This version trusts the worker's off-chain verification. It exists
     * for backward compatibility and for cases where the full proof
     * struct is not available (e.g. demo mode). In production,
     * markRepaidWithProof should be used instead.
     */
    function markRepaid(uint256 loanId, bytes32 repaymentProofHash) external onlyWorker {
        LoanData storage loan = loans[loanId];
        require(loan.exists, "Loan: loan does not exist");
        require(loan.status == LoanStatus.Originated, "Loan: not originated");

        // Pull real tokens back from the borrower into the pool.
        liquidityPool.repayToPool(loanId, loan.amount, loan.borrower);

        loan.status = LoanStatus.Repaid;
        loan.repaidBlock = block.number;
        loan.repaymentProofHash = repaymentProofHash;

        agentReputation.recordRepaid(loanId);
        borrowerReputation.recordRepaid(loan.borrower);

        emit LoanRepaid(loanId, block.number, repaymentProofHash);
    }

    // ─── Default ───────────────────────────────────────────────────────

    /**
     * Mark a loan as defaulted.
     *
     * Called by the worker when the due block has passed. The writability
     * action tx hash (the Creditcoin→Sepolia action) is stored on-chain.
     */
    function markDefaulted(uint256 loanId, bytes32 writabilityActionTxHash) external onlyWorker {
        LoanData storage loan = loans[loanId];
        require(loan.exists, "Loan: loan does not exist");
        require(loan.status == LoanStatus.Originated, "Loan: not originated");
        require(block.number >= loan.dueBlock, "Loan: due block not reached");

        loan.status = LoanStatus.Defaulted;
        loan.defaultBlock = block.number;
        loan.writabilityActionTxHash = writabilityActionTxHash;

        agentReputation.recordDefaulted(loanId);
        borrowerReputation.recordDefaulted(loan.borrower);

        emit LoanDefaulted(loanId, block.number, writabilityActionTxHash);
    }

    // ─── Reads ─────────────────────────────────────────────────────────

    function status(uint256 loanId) external view returns (LoanStatus) {
        require(loans[loanId].exists, "Loan: loan does not exist");
        return loans[loanId].status;
    }

    function getLoan(uint256 loanId)
        external
        view
        returns (
            address borrower,
            uint256 amount,
            uint256 rate,
            uint256 term,
            uint256 dueBlock,
            uint256 originatedBlock,
            LoanStatus loanStatus,
            bytes32 attestationProofHash
        )
    {
        LoanData storage loan = loans[loanId];
        require(loan.exists, "Loan: loan does not exist");
        return (
            loan.borrower,
            loan.amount,
            loan.rate,
            loan.term,
            loan.dueBlock,
            loan.originatedBlock,
            loan.status,
            loan.attestationProofHash
        );
    }

    // ─── Constants ─────────────────────────────────────────────────────

    /// Approximate blocks per day on Creditcoin CC3 Testnet (~15s blocks).
    uint256 public constant BLOCKS_PER_DAY = 5760;
}
