// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MochiNFT} from "./MochiNFT.sol";

interface IPriceOracleLike {
    function latestAnswer() external view returns (int256);
}

contract MochiAuction is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Currency {
        Avax,
        Usdc
    }

    enum EscrowProvider {
        Internal
    }

    struct AuctionInfo {
        string tokenUri;
        bool isItemAuction;
        address seller;
        uint256 tokenId;
        uint64 startTime;
        uint64 endTime;
        uint256 startingPrice;
        Currency currency;
        bool finalized;
        EscrowProvider escrowProvider;
        bool escrowSettled;
    }

    struct BidInfo {
        address bidder;
        uint256 amount;
        Currency currency;
    }

    uint64 public constant MIN_AUCTION_DURATION = 1 hours;
    uint64 public constant MAX_AUCTION_DURATION = 30 days;
    uint256 public constant MIN_INCREMENT_BPS = 500;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant AVAX_DECIMALS = 1e18;
    uint256 public constant USDC_DECIMALS = 1e6;
    uint256 public constant ORACLE_DECIMALS = 1e8;

    MochiNFT public immutable nft;
    IERC20 public immutable usdc;
    IPriceOracleLike public oracle;
    EscrowProvider public escrowProvider = EscrowProvider.Internal;
    uint256 public nextAuctionId;

    mapping(uint256 => AuctionInfo) public auctions;
    mapping(uint256 => BidInfo) public highestBids;

    event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 indexed tokenId, Currency currency, uint256 startingPrice, uint64 endTime);
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount, Currency currency);
    event AuctionFinalized(uint256 indexed auctionId, address indexed winner, uint256 amount, Currency currency);

    constructor(address initialOwner, address nftAddress, address usdcAddress, address oracleAddress) Ownable(initialOwner) {
        nft = MochiNFT(nftAddress);
        usdc = IERC20(usdcAddress);
        oracle = IPriceOracleLike(oracleAddress);
    }

    function configureOracle(address nextOracle) external onlyOwner {
        oracle = IPriceOracleLike(nextOracle);
    }

    function configureInternalEscrow() external onlyOwner {
        escrowProvider = EscrowProvider.Internal;
    }

    function createItemAuction(
        uint256 tokenId,
        uint256 startingPrice,
        Currency currency,
        uint64 durationSeconds
    ) external returns (uint256 auctionId) {
        require(durationSeconds >= MIN_AUCTION_DURATION, "duration too short");
        require(durationSeconds <= MAX_AUCTION_DURATION, "duration too long");
        require(startingPrice > 0, "price=0");
        require(nft.ownerOf(tokenId) == msg.sender, "not owner");

        nft.transferFrom(msg.sender, address(this), tokenId);

        auctionId = nextAuctionId++;
        AuctionInfo storage auction = auctions[auctionId];
        auction.tokenUri = nft.tokenURI(tokenId);
        auction.isItemAuction = true;
        auction.seller = msg.sender;
        auction.tokenId = tokenId;
        auction.startTime = uint64(block.timestamp);
        auction.endTime = uint64(block.timestamp + durationSeconds);
        auction.startingPrice = startingPrice;
        auction.currency = currency;
        auction.escrowProvider = escrowProvider;

        emit AuctionCreated(auctionId, msg.sender, tokenId, currency, startingPrice, auction.endTime);
    }

    function bidAvax(uint256 auctionId) external payable nonReentrant {
        _placeBid(auctionId, msg.sender, msg.value, Currency.Avax);
    }

    function bidUsdc(uint256 auctionId, uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        _placeBid(auctionId, msg.sender, amount, Currency.Usdc);
    }

    function finalizeAuction(uint256 auctionId) external nonReentrant {
        AuctionInfo storage auction = auctions[auctionId];
        require(auction.seller != address(0), "auction missing");
        require(!auction.finalized, "finalized");
        require(block.timestamp >= auction.endTime, "auction active");

        auction.finalized = true;
        BidInfo memory bid = highestBids[auctionId];
        if (bid.bidder == address(0)) {
            nft.transferFrom(address(this), auction.seller, auction.tokenId);
            emit AuctionFinalized(auctionId, address(0), 0, auction.currency);
            return;
        }

        _payoutInternal(bid, auction.seller);

        nft.transferFrom(address(this), bid.bidder, auction.tokenId);
        emit AuctionFinalized(auctionId, bid.bidder, bid.amount, bid.currency);
    }

    function totalAuctions() external view returns (uint256) {
        return nextAuctionId;
    }

    function getAuction(uint256 auctionId) external view returns (AuctionInfo memory) {
        return auctions[auctionId];
    }

    function getHighestBid(uint256 auctionId) external view returns (BidInfo memory) {
        return highestBids[auctionId];
    }

    function _placeBid(uint256 auctionId, address bidder, uint256 amount, Currency currency) internal {
        AuctionInfo storage auction = auctions[auctionId];
        require(auction.seller != address(0), "auction missing");
        require(!auction.finalized, "finalized");
        require(block.timestamp < auction.endTime, "auction ended");

        uint256 normalizedBid = _normalizeToUsdcE8(amount, currency);
        uint256 normalizedFloor = _normalizeToUsdcE8(auction.startingPrice, auction.currency);
        BidInfo memory previousBid = highestBids[auctionId];
        if (previousBid.bidder == address(0)) {
            require(normalizedBid >= normalizedFloor, "below starting price");
        } else {
            uint256 previousNormalized = _normalizeToUsdcE8(previousBid.amount, previousBid.currency);
            require(normalizedBid >= previousNormalized + ((previousNormalized * MIN_INCREMENT_BPS) / BPS_DENOMINATOR), "bid too low");
            _refundBid(previousBid);
        }

        highestBids[auctionId] = BidInfo({ bidder: bidder, amount: amount, currency: currency });
        emit BidPlaced(auctionId, bidder, amount, currency);
    }

    function _refundBid(BidInfo memory bid) internal {
        if (bid.bidder == address(0) || bid.amount == 0) return;
        if (bid.currency == Currency.Avax) {
            (bool ok,) = payable(bid.bidder).call{value: bid.amount}("");
            require(ok, "refund failed");
        } else {
            usdc.safeTransfer(bid.bidder, bid.amount);
        }
    }

    function _payoutInternal(BidInfo memory bid, address seller) internal {
        if (bid.currency == Currency.Avax) {
            (bool ok,) = payable(seller).call{value: bid.amount}("");
            require(ok, "avax payout failed");
        } else {
            usdc.safeTransfer(seller, bid.amount);
        }
    }

    function _normalizeToUsdcE8(uint256 amount, Currency currency) internal view returns (uint256) {
        if (currency == Currency.Usdc) {
            return (amount * ORACLE_DECIMALS) / USDC_DECIMALS;
        }
        int256 rawAnswer = oracle.latestAnswer();
        require(rawAnswer > 0, "oracle unavailable");
        return (amount * uint256(rawAnswer)) / AVAX_DECIMALS;
    }

    receive() external payable {}
}
