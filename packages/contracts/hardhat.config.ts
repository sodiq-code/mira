import { HardhatUserConfig } from 'hardhat/config';

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

export default config;
