// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * IBlockProverPrecompile — the Creditcoin BlockProver precompile interface.
 *
 * This is the on-chain trust root. The precompile at 0x…0FD2 verifies
 * that a Sepolia transaction is included in an attested block, using
 * the Merkle inclusion proof + continuity proof.
 *
 * MIRA's Loan contract calls this directly during markRepaid, so the
 * contract — not the worker — is the trust anchor for repayment
 * verification. A compromised worker key cannot fabricate a repayment.
 */
interface IBlockProverPrecompile {
    /**
     * Verify a single transaction inclusion proof (gasless eth_call
     * version — does not emit an event).
     *
     * @param chainKey      The source chain key (1 for Sepolia)
     * @param headerNumber  The attested block height
     * @param txBytes       The raw transaction bytes
     * @param merkleProof   The Merkle inclusion proof
     * @param continuityProof  The continuity proof
     * @return true if the proof is valid
     */
    function verifySingle(
        uint256 chainKey,
        uint256 headerNumber,
        bytes calldata txBytes,
        bytes calldata merkleProof,
        bytes calldata continuityProof
    ) external view returns (bool);
}

/**
 * ITransactionVerifiedEvent — listener for the TransactionVerified event
 * emitted by the BlockProver precompile when verifyAndEmitSingle is called.
 *
 * MIRA's Loan contract can check whether a TransactionVerified event
 * was emitted for a given transaction hash in a recent block range,
 * providing an alternative proof path that doesn't require passing the
 * full proof struct on-chain.
 */
interface ITransactionVerifiedEvent {
    event TransactionVerified(
        uint256 indexed chainKey,
        uint256 indexed height,
        uint256 indexed txIndex
    );
}
