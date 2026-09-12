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
    // ─── Roles ──────────────────────────────────────────────────────────

    /// Deployer (governance). Can rotate the authorized caller.
    address public owner;

    /// The only address permitted to call recordDefault (the MIRA
    /// writability relayer in production). Set at deployment; rotatable
    /// by the owner.
    address public authorized;

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
    event AuthorizedCallerSet(address indexed oldAuthorized, address indexed newAuthorized);

    /// @param _authorized The relayer permitted to record defaults
    ///        (the MIRA writability relayer). Pass address(0) to start
    ///        open and restrict later via setAuthorized — but production
    ///        deployments should pass the relayer address here.
    constructor(address _authorized) {
        owner = msg.sender;
        authorized = _authorized;
    }

    /// Rotate the authorized caller. Owner-only.
    function setAuthorized(address _authorized) external {
        require(msg.sender == owner, "DefaultMarker: not owner");
        emit AuthorizedCallerSet(authorized, _authorized);
        authorized = _authorized;
    }

    /// Transfer ownership. Owner-only.
    function transferOwnership(address _owner) external {
        require(msg.sender == owner, "DefaultMarker: not owner");
        require(_owner != address(0), "DefaultMarker: zero owner");
        owner = _owner;
    }

    /**
     * Record a default. Only the authorized caller (or the owner as an
     * escape hatch) may call this. The hasDefault guard still prevents
     * duplicate records for the same (borrower, loanId) pair.
     */
    function recordDefault(
        address borrower,
        uint256 loanId,
        bytes32 creditcoinTxHash
    ) external {
        require(
            msg.sender == authorized || msg.sender == owner,
            "DefaultMarker: not authorized"
        );
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
