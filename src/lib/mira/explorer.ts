/**
 * Block-explorer URL builders for the two chains MIRA spans.
 *
 * These are display-only helpers: every transaction hash the UI surfaces is
 * turned into a clickable link so a judge can confirm the on-chain evidence
 * directly. The Creditcoin CC3 Testnet explorer and Sepolia Etherscan are
 * the two surfaces a demo audience expects.
 */

const CC3_EXPLORER_TX = 'https://cc3-testnet.creditcoin.network/extrinsic';
const CC3_EXPLORER_BLOCK = 'https://cc3-testnet.creditcoin.network/block';
const SEPOLIA_EXPLORER_TX = 'https://sepolia.etherscan.io/tx';
const SEPOLIA_EXPLORER_ADDR = 'https://sepolia.etherscan.io/address';

export function cc3TxUrl(txHash: string): string {
  return `${CC3_EXPLORER_TX}/${txHash}`;
}

export function cc3BlockUrl(block: number | string): string {
  return `${CC3_EXPLORER_BLOCK}/${block}`;
}

export function sepoliaTxUrl(txHash: string): string {
  return `${SEPOLIA_EXPLORER_TX}/${txHash}`;
}

export function sepoliaAddressUrl(address: string): string {
  return `${SEPOLIA_EXPLORER_ADDR}/${address}`;
}

/**
 * Shorten a hash/address for compact display, keeping the prefix + suffix so
 * the value remains recognizable and greppable.
 *
 * `0x9a3f…e1f2`
 */
export function shortenHash(hash: string, head = 6, tail = 4): string {
  if (!hash) return '';
  if (hash.length <= head + tail + 2) return hash;
  return `${hash.slice(0, head + 2)}…${hash.slice(-tail)}`;
}
