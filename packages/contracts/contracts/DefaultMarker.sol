// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * DefaultMarker — records loan defaults on Ethereum for transparency and
 * composability.
 *
 * Deployed on Sepolia (the source chain). Called by the MIRA writability
 * relayer when a loan defaults on Creditcoin. This is the "Writability" half
 * of the Attestcoin protocol: a Creditcoin-initiated action that writes
 * state to the source chain.
 *
 * Why this matters:
 *   - The default is publicly visible in the Sepolia explorer (transparency)
 *   - Other protocols can read a borrower's default history (composability)
 *   - It closes the loop: read Sepolia → decide on Creditcoin → write to Sepolia
 *
 * One record per (borrower, loanId) — duplicates are rejected.
 */
contract DefaultMarker {
    struct DefaultRecord {
        uint256 loanId;
        bytes32 creditcoinTxHash;
        uint256 blockNumber;
    }

    /// All defaults for a given borrower, append-only.
    mapping(address => DefaultRecord[]) private defaults;

    /// Quick lookup: has this (borrower, loanId) pair already been recorded?
    mapping(address => mapping(uint256 => bool)) public hasDefault;

    event DefaultRecorded(
        address indexed borrower,
        uint256 indexed loanId,
        bytes32 creditcoinTxHash,
        uint256 blockNumber
    );

    /**
     * Record a default. Called by the relayer (authorized caller in
     * production; open for the demo to keep the flow simple).
     */
    function recordDefault(
        address borrower,
        uint256 loanId,
        bytes32 creditcoinTxHash
    ) external {
        require(!hasDefault[borrower][loanId], "Already recorded");
        hasDefault[borrower][loanId] = true;
        defaults[borrower].push(DefaultRecord({
            loanId: loanId,
            creditcoinTxHash: creditcoinTxHash,
            blockNumber: block.number
        }));
        emit DefaultRecorded(borrower, loanId, creditcoinTxHash, block.number);
    }

    function getDefaults(address borrower) external view returns (DefaultRecord[] memory) {
        return defaults[borrower];
    }

    function getDefaultCount(address borrower) external view returns (uint256) {
        return defaults[borrower].length;
    }
}
