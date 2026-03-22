// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MochiEscrowVault is Ownable {
    using SafeERC20 for IERC20;

    address public operator;

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyAuthorized() {
        require(msg.sender == owner() || msg.sender == operator, "unauthorized");
        _;
    }

    function setOperator(address nextOperator) external onlyOwner {
        operator = nextOperator;
    }

    function payoutToken(address token, address to, uint256 amount) external onlyAuthorized {
        require(amount > 0, "amount=0");
        IERC20(token).safeTransfer(to, amount);
    }

    function payoutNative(address payable to, uint256 amount) external onlyAuthorized {
        require(amount > 0, "amount=0");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "native payout failed");
    }

    receive() external payable {}
}
