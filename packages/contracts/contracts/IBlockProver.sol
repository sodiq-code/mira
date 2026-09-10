// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * IBlockProverPrecompile — the Creditcoin BlockProver precompile interface.
 *
 * This is the on-chain trust root. The precompile at 0x…0FD2 verifies
 * that a Sepolia transaction is included in an attested block, using
 * the Merkle inclusion proof + continuity proof.
 *
 * MIRA's Loan contract calls this directly during markRepaidWithProof, so
 * the contract — not the worker — is the trust anchor for repayment
 * verification. A compromised worker key cannot fabricate a repayment.
 *
 * The precompile's canonical signature is:
 *   verify(uint64 chainKey, uint64 headerNumber, bytes txBytes,
 *          (bytes32,(bytes32,bool)[]) merkleProof,
 *          (bytes32,bytes32[]) continuityProof)
 *
 * The merkleProof and continuityProof are STRUCTURED TUPLES, not opaque
 * bytes. Passing them as `bytes` would ABI-encode them as dynamic byte
 * arrays (offset+length+data) which does NOT match the tuple encoding the
 * precompile expects. This interface therefore declares the exact tuple
 * types so the compiler generates the correct calldata.
 */
interface IBlockProverPrecompile {
    /// A single Merkle sibling: its hash and whether it is the left child.
    struct Sibling {
        bytes32 hash;
        bool isLeft;
    }

    /// A Merkle inclusion proof: the root and the list of siblings.
    struct MerkleProof {
        bytes32 root;
        Sibling[] siblings;
    }

    /// A continuity proof: the lower endpoint digest and the chain of roots.
    struct ContinuityProof {
        bytes32 lowerEndpointDigest;
        bytes32[] roots;
    }

    /**
     * Verify a single transaction inclusion proof (gasless eth_call
     * version — does not emit an event).
     *
     * NOTE: the function is named `verify` and uses `uint64` for the
     * chain key and height — this MUST match the precompile's canonical
     * signature `verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),
     * (bytes32,bytes32[]))` exactly, because the EVM dispatches on the
     * 4-byte selector derived from the signature string. A different
     * name (e.g. `verifySingle`) or type (e.g. `uint256`) produces a
     * different selector and the precompile rejects it with
     * "Unknown selector".
     *
     * @param chainKey      The source chain key (1 for Sepolia)
     * @param headerNumber  The attested block height
     * @param txBytes       The raw transaction bytes
     * @param merkleProof   The Merkle inclusion proof (structured tuple)
     * @param continuityProof  The continuity proof (structured tuple)
     * @return true if the proof is valid
     */
    function verify(
        uint64 chainKey,
        uint64 headerNumber,
        bytes calldata txBytes,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external view returns (bool);
}

/**
 * ITransactionVerifiedEvent — listener for the TransactionVerified event
 * emitted by the BlockProver precompile when verifyAndEmitSingle is called.
 */
interface ITransactionVerifiedEvent {
    event TransactionVerified(
        uint256 indexed chainKey,
        uint256 indexed height,
        uint256 indexed txIndex
    );
}
