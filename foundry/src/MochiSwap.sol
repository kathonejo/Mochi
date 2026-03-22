// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MochiNFT} from "./MochiNFT.sol";

contract MochiSwap is Ownable, ReentrancyGuard {
    struct SwapListing {
        address creator;
        uint256 offeredTokenId;
        string intention;
        bool active;
    }

    struct SwapBid {
        uint256 listingId;
        address bidder;
        uint256 bidderTokenId;
        bool active;
    }

    uint64 public constant MAX_SWAP_INTENTION_LEN = 280;

    MochiNFT public immutable nft;

    uint256 public nextSwapListingId;
    uint256 public nextSwapBidId;

    mapping(uint256 => SwapListing) public swapListings;
    mapping(uint256 => SwapBid) public swapBids;

    event SwapListingCreated(uint256 indexed listingId, address indexed creator, uint256 indexed offeredTokenId, string intention);
    event SwapBidPlaced(uint256 indexed bidId, uint256 indexed listingId, address indexed bidder, uint256 bidderTokenId);
    event SwapBidAccepted(uint256 indexed listingId, uint256 indexed bidId, address indexed creator, address bidder);
    event SwapListingCancelled(uint256 indexed listingId, address indexed creator);
    event SwapBidCancelled(uint256 indexed bidId, uint256 indexed listingId, address indexed bidder);

    constructor(address initialOwner, address nftAddress) Ownable(initialOwner) {
        nft = MochiNFT(nftAddress);
    }

    function createSwapListing(uint256 offeredTokenId, string calldata intention) external returns (uint256 listingId) {
        uint256 intentionLength = bytes(intention).length;
        require(intentionLength > 0 && intentionLength <= MAX_SWAP_INTENTION_LEN, "invalid intention");
        require(nft.ownerOf(offeredTokenId) == msg.sender, "not owner");

        nft.transferFrom(msg.sender, address(this), offeredTokenId);

        listingId = nextSwapListingId++;
        swapListings[listingId] = SwapListing({
            creator: msg.sender,
            offeredTokenId: offeredTokenId,
            intention: intention,
            active: true
        });

        emit SwapListingCreated(listingId, msg.sender, offeredTokenId, intention);
    }

    function placeSwapBid(uint256 listingId, uint256 bidderTokenId) external returns (uint256 bidId) {
        SwapListing memory listing = swapListings[listingId];
        require(listing.active, "swap inactive");
        require(listing.creator != msg.sender, "creator cannot bid");
        require(nft.ownerOf(bidderTokenId) == msg.sender, "not owner");

        nft.transferFrom(msg.sender, address(this), bidderTokenId);

        bidId = nextSwapBidId++;
        swapBids[bidId] = SwapBid({
            listingId: listingId,
            bidder: msg.sender,
            bidderTokenId: bidderTokenId,
            active: true
        });

        emit SwapBidPlaced(bidId, listingId, msg.sender, bidderTokenId);
    }

    function acceptSwapBid(uint256 listingId, uint256 bidId) external nonReentrant {
        SwapListing storage listing = swapListings[listingId];
        SwapBid storage bid = swapBids[bidId];
        require(listing.active, "swap inactive");
        require(listing.creator == msg.sender, "not creator");
        require(bid.active && bid.listingId == listingId, "bid inactive");

        listing.active = false;
        bid.active = false;

        nft.transferFrom(address(this), bid.bidder, listing.offeredTokenId);
        nft.transferFrom(address(this), listing.creator, bid.bidderTokenId);

        emit SwapBidAccepted(listingId, bidId, listing.creator, bid.bidder);
    }

    function cancelSwapListing(uint256 listingId) external nonReentrant {
        SwapListing storage listing = swapListings[listingId];
        require(listing.active, "swap inactive");
        require(listing.creator == msg.sender, "not creator");

        listing.active = false;
        nft.transferFrom(address(this), msg.sender, listing.offeredTokenId);

        emit SwapListingCancelled(listingId, msg.sender);
    }

    function cancelSwapBid(uint256 bidId) external nonReentrant {
        SwapBid storage bid = swapBids[bidId];
        require(bid.active, "bid inactive");
        require(bid.bidder == msg.sender, "not bidder");

        bid.active = false;
        nft.transferFrom(address(this), msg.sender, bid.bidderTokenId);

        emit SwapBidCancelled(bidId, bid.listingId, msg.sender);
    }

    function totalSwapListings() external view returns (uint256) {
        return nextSwapListingId;
    }

    function totalSwapBids() external view returns (uint256) {
        return nextSwapBidId;
    }

    function getSwapListing(uint256 listingId) external view returns (SwapListing memory) {
        return swapListings[listingId];
    }

    function getSwapBid(uint256 bidId) external view returns (SwapBid memory) {
        return swapBids[bidId];
    }
}
