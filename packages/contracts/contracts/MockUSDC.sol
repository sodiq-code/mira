// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * MockUSDC — a simple ERC-20 token for the lending pool.
 *
 * Mirrors the real USDC interface (6 decimals) so the same LiquidityPool
 * code runs against real USDC on mainnet without changes. The mint function
 * is governance-gated so only the protocol deployer can seed capital.
 *
 * This is a testnet-only contract; on mainnet the pool would be wired to
 * the real USDC (or Creditcoin's native stablecoin) address instead.
 */
contract MockUSDC {
    string public constant name = "USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public governance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Minted(address indexed to, uint256 amount);

    modifier onlyGovernance() {
        require(msg.sender == governance, "MockUSDC: not governance");
        _;
    }

    constructor() {
        governance = msg.sender;
    }

    function mint(address to, uint256 amount) external onlyGovernance {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Minted(to, amount);
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "MockUSDC: insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "MockUSDC: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
