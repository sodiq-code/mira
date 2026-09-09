import { ethers } from 'hardhat';

/**
 * Deploy the HelloWorld contract to the configured network (Creditcoin CC3
 * Testnet by default). Prints the deployed address so it can be recorded in
 * the environment configuration of the worker and frontend.
 *
 * Run with: `bun run contracts:deploy` (from the repo root).
 */
async function main(): Promise<void> {
  const greeting = process.env.MIRA_GREETING ?? 'MIRA online';
  const HelloWorld = await ethers.getContractFactory('HelloWorld');
  const contract = await HelloWorld.deploy(greeting);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`HelloWorld deployed to ${address} with greeting "${greeting}"`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
