// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Minimal deployment target used to validate that the Hardhat toolchain can
 * compile, deploy, and transact against Creditcoin CC3 Testnet end-to-end.
 *
 * It is intentionally tiny: a single mutable greeting plus a counter that
 * records how many times the contract has been touched. Real protocol
 * contracts (Policy, Loan, AgentReputation, BorrowerReputation, LiquidityPool)
 * are introduced alongside their respective features.
 */
contract HelloWorld {
    string public greeting;
    uint256 public touchCount;

    event GreetingUpdated(address indexed by, string greeting, uint256 newTouchCount);

    constructor(string memory _greeting) {
        greeting = _greeting;
        touchCount = 0;
    }

    function setGreeting(string calldata _greeting) external {
        greeting = _greeting;
        touchCount += 1;
        emit GreetingUpdated(msg.sender, _greeting, touchCount);
    }

    function touch() external {
        touchCount += 1;
        emit GreetingUpdated(msg.sender, greeting, touchCount);
    }
}
