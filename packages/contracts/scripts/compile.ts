/**
 * Compile all MIRA Solidity contracts with solc and emit Hardhat-style
 * artifacts (ABI + bytecode) into packages/contracts/artifacts/contracts.
 *
 * This avoids the Hardhat 2 + ESM ts-node config-loading conflict by
 * invoking the solc compiler directly. The output format matches what
 * the worker's loadArtifact helpers expect: <Name>.sol/<Name>.json with
 * { abi, bytecode }.
 */
import * as solc from 'solc';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = process.cwd();
const SOURCES = join(ROOT, 'packages', 'contracts', 'contracts');
const OUT = join(ROOT, 'packages', 'contracts', 'artifacts', 'contracts');

const SOL_FILES = readdirSync(SOURCES)
  .filter((f) => f.endsWith('.sol'))
  .map((f) => f.replace(/\.sol$/, ''));

// Build the solc input sources: every .sol file keyed by its basename.
const sources: Record<string, { content: string }> = {};
for (const f of SOL_FILES) {
  sources[`${f}.sol`] = { content: readFileSync(join(SOURCES, `${f}.sol`), 'utf8') };
}

const input = {
  language: 'Solidity' as const,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'],
      },
    },
  },
  sources,
};

console.log('Compiling contracts with solc...');
const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
  errors?: { severity: string; formattedMessage: string }[];
  contracts?: Record<string, Record<string, { abi: unknown[]; evm?: { bytecode?: { object: string } } }>>;
};

const errors = output.errors ?? [];
const hasError = errors.some((e) => e.severity === 'error');
for (const e of errors) {
  console.log(`  [${e.severity}] ${e.formattedMessage}`);
}
if (hasError) {
  console.error('Compilation failed.');
  process.exit(1);
}

let count = 0;
for (const [fileName, contracts] of Object.entries(output.contracts ?? {})) {
  for (const [contractName, data] of Object.entries(contracts)) {
    const dir = join(OUT, fileName);
    mkdirSync(dir, { recursive: true });
    const rawBytecode = data.evm?.bytecode?.object ?? '';
    const artifact = {
      abi: data.abi,
      // solc returns the bytecode object as a bare hex string (no 0x prefix);
      // ethers' ContractFactory expects a 0x-prefixed hex string.
      bytecode: rawBytecode.startsWith('0x') ? rawBytecode : '0x' + rawBytecode,
    };
    writeFileSync(join(dir, `${contractName}.json`), JSON.stringify(artifact, null, 2));
    console.log(`  ✓ ${fileName}:${contractName}`);
    count++;
  }
}
console.log(`Compiled ${count} contract(s).`);
