import type { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';

/**
 * Hardhat configuration targeting Creditcoin CC3 Testnet.
 *
 * CC3 Testnet is an EVM-compatible chain, so it works with the standard
 * Hardhat toolchain. The deployer account is read from the environment so no
 * secret ever lands in source. When no key is configured, Hardhat still
 * compiles and tests against the in-process network — only deployment is gated.
 */
const PRIVATE_KEY = process.env.CREDITCOIN_PRIVATE_KEY ?? '0x0000000000000000000000000000000000000000000000000000000000000001';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    creditcoin_testnet: {
      url: process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network',
      chainId: 1020300,
      accounts: [PRIVATE_KEY],
    },
    hardhat: {
      // Local in-process network used for unit tests.
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};

export default config;
