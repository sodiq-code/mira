#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "── Compiling contracts ──"
npx hardhat compile 2>&1 | tail -3

# Kill any zombie Hardhat nodes from previous runs
pkill -9 -f "hardhat" 2>/dev/null || true
sleep 2

echo ""
echo "── Starting Hardhat node on port 18545 ──"
npx hardhat node --port 18545 > /tmp/hardhat-node.log 2>&1 &
NODE_PID=$!

# Wait for the node to be ready
for i in $(seq 1 30); do
  if curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    http://127.0.0.1:18545 > /dev/null 2>&1; then
    echo "Node ready (attempt $i)"
    break
  fi
  sleep 0.5
done

# Check the initial nonce of account #0
echo "=== Initial nonce check ==="
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_getTransactionCount","params":["0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266","latest"],"id":1}' \
  http://127.0.0.1:18545
echo ""

echo ""
echo "── Running test/contracts.test.ts ──"
HARDHAT_NODE_URL=http://127.0.0.1:18545 npx mocha --node-option=import=tsx --timeout 60000 test/contracts.test.ts 2>&1
EXIT_CODE=$?

# Clean up
kill $NODE_PID 2>/dev/null || true
wait $NODE_PID 2>/dev/null || true

exit $EXIT_CODE
