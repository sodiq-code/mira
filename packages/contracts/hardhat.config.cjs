/**
 * Hardhat configuration (CommonJS).
 *
 * A .cjs config is used instead of .ts because the contracts package has
 * "type": "module", which makes Hardhat 2's ts-node loader fail to require()
 * a .ts config (ESM/CJS conflict). A plain .cjs file loads reliably under
 * both CJS and ESM package scopes.
 */
const PRIVATE_KEY = process.env.CREDITCOIN_PRIVATE_KEY ?? '0x0000000000000000000000000000000000000000000000000000000000000001';

/** @type {import('hardhat/config').HardhatUserConfig} */
const config = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    creditcoin_testnet: {
      type: 'http',
      url: process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network',
      chainId: 1020300,
      accounts: [PRIVATE_KEY],
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};

module.exports = config;
