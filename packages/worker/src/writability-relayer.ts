/**
 * Writability relayer: watches for LoanDefaulted events on Creditcoin and
 * triggers the corresponding action on Ethereum Sepolia.
 *
 * Attestcoin Writability is the deeper half of the protocol: a
 * Creditcoin-initiated action that writes state to the source chain
 * (Ethereum Sepolia). In MIRA's design, when a loan defaults, the protocol
 * records a "credit default" marker on Ethereum — a permanent, on-chain
 * record that the borrower defaulted on a Creditcoin loan. This marker:
 *   - Is visible in the Sepolia explorer (transparency)
 *   - Can be read by other protocols (composability)
 *   - Closes the writability loop: read Sepolia → decide on Creditcoin →
 *     write back to Sepolia
 *
 * Architecture:
 *   The relayer is an off-chain process (part of the worker) that:
 *     1. Listens for LoanDefaulted events on the Creditcoin Loan contract
 *     2. When a default is detected, submits a transaction to a
 *        DefaultMarker contract deployed on Ethereum Sepolia
 *     3. Records the Sepolia tx hash back on Creditcoin (via the
 *        writabilityActionHash stored in the Loan contract)
 *
 * The DefaultMarker contract on Sepolia is minimal: it stores a mapping
 * from (borrower, loanId) → default record, readable by anyone.
 *
 * NOTE: In a production system, the relayer would run as a persistent
 * service. For the demo, it is triggered on-demand by the default detector.
 */

import { ethers, type Wallet, Contract, type Log } from 'ethers';

/** The address of the DefaultMarker contract on Ethereum Sepolia. */
export const DEFAULT_MARKER_DEPLOYMENT_BYTECODE = '0x';

/** ABI for the DefaultMarker contract on Sepolia.
 *
 * IMPORTANT: this must stay in sync with
 * packages/contracts/contracts/DefaultMarker.sol. The contract is
 * access-controlled: only the `authorized` caller (or `owner` as an escape
 * hatch) may call recordDefault. The relayer's address must be registered via
 * setAuthorized(owner) at deployment time. */
export const DEFAULT_MARKER_ABI = [
  'function recordDefault(address borrower, uint256 loanId, bytes32 creditcoinTxHash) external',
  'function setAuthorized(address _authorized) external',
  'function transferOwnership(address _owner) external',
  'function owner() view returns (address)',
  'function authorized() view returns (address)',
  'function getDefaultCount(address borrower) external view returns (uint256)',
  'function getDefaults(address borrower) external view returns (tuple(uint256 loanId, bytes32 creditcoinTxHash, uint256 blockNumber)[])',
  'event DefaultRecorded(address indexed borrower, uint256 indexed loanId, bytes32 creditcoinTxHash, uint256 blockNumber)',
  'event AuthorizedCallerSet(address indexed oldAuthorized, address indexed newAuthorized)',
];

/** The result of a writability action. */
export interface WritabilityResult {
  success: boolean;
  loanId: number;
  borrower: string;
  /** The Sepolia tx hash of the writability action. */
  sepoliaTxHash?: string;
  /** The Creditcoin tx hash that triggered the default. */
  creditcoinTxHash: string;
  /** Whether the DefaultMarker event was emitted on Sepolia. */
  markerRecorded: boolean;
  error?: string;
}

/**
 * Submit a writability action to Ethereum Sepolia: record the default
 * on the source chain so it is publicly visible and composable.
 *
 * @param opts.sepoliaWallet       A funded Ethereum Sepolia wallet
 * @param opts.defaultMarkerAddress  The DefaultMarker contract address on Sepolia
 * @param opts.borrower             The borrower's address
 * @param opts.loanId               The defaulted loan ID
 * @param opts.creditcoinTxHash     The Creditcoin tx hash that marked the default
 */
export async function submitWritabilityAction(opts: {
  sepoliaWallet: Wallet;
  defaultMarkerAddress: string;
  borrower: string;
  loanId: number;
  creditcoinTxHash: string;
}): Promise<WritabilityResult> {
  const { sepoliaWallet, defaultMarkerAddress, borrower, loanId, creditcoinTxHash } = opts;

  const marker = new Contract(defaultMarkerAddress, DEFAULT_MARKER_ABI, sepoliaWallet);

  // Convert the Creditcoin tx hash to bytes32 for on-chain storage
  const creditcoinHashBytes = ethers.id(creditcoinTxHash);

  try {
    // Submit the recordDefault transaction on Sepolia
    const nonce = await getNonce(sepoliaWallet);
    const data = marker.interface.encodeFunctionData('recordDefault', [
      borrower,
      BigInt(loanId),
      creditcoinHashBytes,
    ]);

    const tx = await sepoliaWallet.sendTransaction({
      to: defaultMarkerAddress,
      data,
      nonce,
      type: 0,
      gasLimit: 200_000,
    });
    const receipt = await tx.wait();

    // Check for the DefaultRecorded event
    const event = receipt!.logs.find((l: Log) => {
      try { return marker.interface.parseLog(l)?.name === 'DefaultRecorded'; } catch { return false; }
    });

    return {
      success: true,
      loanId,
      borrower,
      sepoliaTxHash: receipt!.hash,
      creditcoinTxHash,
      markerRecorded: !!event,
    };
  } catch (err) {
    return {
      success: false,
      loanId,
      borrower,
      creditcoinTxHash,
      markerRecorded: false,
      error: `Writability action failed: ${(err as Error).message}`,
    };
  }
}

/**
 * The DefaultMarker Solidity contract source (for deployment to Sepolia).
 * This MUST stay byte-for-byte in sync with
 * packages/contracts/contracts/DefaultMarker.sol so that any deployment via
 * the worker uses the access-controlled version. The relayer's own address
 * must be passed as the constructor's `_authorized` argument at deploy time.
 */
export const DEFAULT_MARKER_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * DefaultMarker — records loan defaults on Ethereum for transparency and
 * composability. Deployed on Sepolia; called by the MIRA writability relayer
 * when a loan defaults on Creditcoin.
 *
 * Access control: only the authorized caller (set at deployment, rotatable by
 * the owner) may record defaults. The deployer is the owner and can rotate
 * the authorized caller if the relayer key is ever compromised.
 */
contract DefaultMarker {
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

    mapping(address => DefaultRecord[]) private defaults;
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
`;

async function getNonce(wallet: Wallet): Promise<number> {
  const provider = wallet.provider;
  if (!provider) throw new Error('Wallet has no provider');
  const url = (provider as any).connection?.url ?? 'http://127.0.0.1:8545';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getTransactionCount',
      params: [wallet.address, 'latest'],
      id: 1,
    }),
  });
  const json = (await resp.json()) as { result: string };
  return parseInt(json.result, 16);
}
