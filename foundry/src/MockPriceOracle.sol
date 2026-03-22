// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MockPriceOracle is Ownable {
    int256 private _answer;
    uint8 public constant decimals = 8;

    constructor(address initialOwner, int256 initialAnswer) Ownable(initialOwner) {
        _answer = initialAnswer;
    }

    function setLatestAnswer(int256 nextAnswer) external onlyOwner {
        require(nextAnswer > 0, "invalid answer");
        _answer = nextAnswer;
    }

    function latestAnswer() external view returns (int256) {
        return _answer;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (0, _answer, block.timestamp, block.timestamp, 0);
    }
}
