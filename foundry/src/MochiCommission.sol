// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MochiCommission is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum CommissionStatus {
        Open,
        Accepted,
        Delivered,
        Completed,
        Cancelled
    }

    enum Currency {
        Avax,
        Usdc
    }

    struct CommissionRequest {
        address buyer;
        string intention;
        string referenceImage;
        uint256 priceAvax;
        uint256 priceUsdc;
        uint256 avaxUsdcRate;
        Currency currency;
        CommissionStatus status;
        uint256 tokenId;
        address artist;
        uint64 createdAt;
    }

    uint64 public constant MAX_INTENTION_LEN = 500;
    uint64 public constant MAX_REF_IMAGE_LEN = 512;

    IERC20 public immutable usdc;
    uint256 public nextCommissionId;
    mapping(uint256 => CommissionRequest) public commissions;

    constructor(address initialOwner, address usdcAddress) Ownable(initialOwner) {
        usdc = IERC20(usdcAddress);
    }

    function createCommission(
        string calldata intention,
        string calldata referenceImage,
        uint256 priceAvax,
        uint256 priceUsdc,
        uint256 avaxUsdcRate,
        Currency currency
    ) external payable nonReentrant returns (uint256 commissionId) {
        require(bytes(intention).length > 0 && bytes(intention).length <= MAX_INTENTION_LEN, "invalid intention");
        require(bytes(referenceImage).length <= MAX_REF_IMAGE_LEN, "reference too long");
        require(priceAvax > 0 && priceUsdc > 0 && avaxUsdcRate > 0, "invalid pricing");

        if (currency == Currency.Avax) {
            require(msg.value == priceAvax, "incorrect avax");
        } else {
            require(msg.value == 0, "unexpected avax");
            usdc.safeTransferFrom(msg.sender, address(this), priceUsdc);
        }

        commissionId = nextCommissionId++;
        commissions[commissionId] = CommissionRequest({
            buyer: msg.sender,
            intention: intention,
            referenceImage: referenceImage,
            priceAvax: priceAvax,
            priceUsdc: priceUsdc,
            avaxUsdcRate: avaxUsdcRate,
            currency: currency,
            status: CommissionStatus.Open,
            tokenId: 0,
            artist: address(0),
            createdAt: uint64(block.timestamp)
        });
    }

    function assignArtist(uint256 commissionId, address artist, uint256 tokenId) external onlyOwner {
        CommissionRequest storage request = commissions[commissionId];
        require(request.status == CommissionStatus.Open, "bad status");
        request.status = CommissionStatus.Accepted;
        request.artist = artist;
        request.tokenId = tokenId;
    }

    function markDelivered(uint256 commissionId) external {
        CommissionRequest storage request = commissions[commissionId];
        require(request.status == CommissionStatus.Accepted, "bad status");
        require(request.artist == msg.sender, "not artist");
        request.status = CommissionStatus.Delivered;
    }

    function approveDelivery(uint256 commissionId) external nonReentrant {
        CommissionRequest storage request = commissions[commissionId];
        require(request.buyer == msg.sender, "not buyer");
        require(request.status == CommissionStatus.Delivered, "bad status");
        request.status = CommissionStatus.Completed;
        if (request.currency == Currency.Avax) {
            (bool ok,) = payable(request.artist).call{value: request.priceAvax}("");
            require(ok, "avax payout failed");
        } else {
            usdc.safeTransfer(request.artist, request.priceUsdc);
        }
    }

    function cancelCommission(uint256 commissionId) external nonReentrant {
        CommissionRequest storage request = commissions[commissionId];
        require(msg.sender == request.buyer || msg.sender == owner(), "not authorized");
        require(request.status == CommissionStatus.Open || request.status == CommissionStatus.Accepted, "bad status");
        request.status = CommissionStatus.Cancelled;
        if (request.currency == Currency.Avax) {
            (bool ok,) = payable(request.buyer).call{value: request.priceAvax}("");
            require(ok, "avax refund failed");
        } else {
            usdc.safeTransfer(request.buyer, request.priceUsdc);
        }
    }

    function totalCommissions() external view returns (uint256) {
        return nextCommissionId;
    }

    function getCommission(uint256 commissionId) external view returns (CommissionRequest memory) {
        return commissions[commissionId];
    }

    receive() external payable {}
}
