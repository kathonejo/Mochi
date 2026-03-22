// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MochiNFT} from "./MochiNFT.sol";
import {MochiEditions} from "./MochiEditions.sol";

contract MochiMarketplace is Ownable, ReentrancyGuard, ERC1155Holder {
    using SafeERC20 for IERC20;

    enum Currency {
        Avax,
        Usdc
    }

    enum EscrowProvider {
        Internal
    }

    enum CommissionOrderStatus {
        Accepted,
        Delivered,
        Completed,
        Refunded
    }

    struct ListingInfo {
        address seller;
        uint256 tokenId;
        uint256 price;
        Currency currency;
        uint64 commissionEtaDays;
        bool isCommissionEgg;
        bool active;
    }

    struct EditionListingInfo {
        address seller;
        uint256 editionId;
        uint256 remainingAmount;
        uint256 price;
        Currency currency;
        bool active;
    }

    struct CommissionOrder {
        address buyer;
        address seller;
        uint256 listingId;
        uint256 tokenId;
        Currency currency;
        uint256 amountPaid;
        uint256 upfrontPaidToSeller;
        uint256 escrowRemaining;
        EscrowProvider escrowProvider;
        address escrowHolder;
        uint64 commissionEtaDays;
        string intention;
        string referenceImageUrl;
        string latestRevisionIntention;
        string latestRevisionRefUrl;
        uint64 revisionRequestCount;
        uint64 maxRevisionRequests;
        string metadataUriAtPurchase;
        string lastDeliveredMetadataUri;
        CommissionOrderStatus status;
        uint64 createdAt;
        uint64 deliveredAt;
        uint64 resolvedAt;
    }

    uint64 public constant MAX_COMMISSION_INTENTION_LEN = 500;
    uint64 public constant MAX_REFERENCE_IMAGE_URL_LEN = 512;
    uint64 public constant MAX_COMMISSION_TURNAROUND_DAYS = 365;
    uint64 public constant MAX_COMMISSION_REVISION_REQUESTS = 3;
    uint64 public constant COMMISSION_AUTO_RELEASE_AFTER_DELIVERY_SECS = 7 days;

    MochiNFT public immutable nft;
    MochiEditions public immutable editions;
    IERC20 public immutable usdc;
    EscrowProvider public escrowProvider = EscrowProvider.Internal;

    uint256 public nextListingId;
    uint256 public nextEditionListingId;
    uint256 public nextCommissionOrderId;

    mapping(uint256 => ListingInfo) public listings;
    mapping(uint256 => EditionListingInfo) public editionListings;
    mapping(uint256 => CommissionOrder) public commissionOrders;
    mapping(address => uint256) public sellerActiveCommissionEggListing;
    mapping(address => uint256) public sellerOpenCommissionOrder;

    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId, bool commissionEgg);
    event ListingPurchased(uint256 indexed listingId, address indexed buyer, uint256 indexed tokenId, Currency currency, bool commissionEgg);
    event EditionListingCreated(uint256 indexed listingId, address indexed seller, uint256 indexed editionId, uint256 amount, Currency currency);
    event EditionListingPurchased(uint256 indexed listingId, address indexed buyer, uint256 indexed editionId, Currency currency, uint256 remainingAmount);
    event CommissionOrderCreated(uint256 indexed orderId, uint256 indexed listingId, address indexed buyer, uint256 tokenId);

    constructor(address initialOwner, address nftAddress, address editionsAddress, address usdcAddress) Ownable(initialOwner) {
        nft = MochiNFT(nftAddress);
        editions = MochiEditions(editionsAddress);
        usdc = IERC20(usdcAddress);
    }

    function configureInternalEscrow() external onlyOwner {
        escrowProvider = EscrowProvider.Internal;
    }

    function listForSale(uint256 tokenId, uint256 price, Currency currency) external returns (uint256 listingId) {
        listingId = _createListing(tokenId, price, currency, 0, false);
    }

    function listCommissionEgg(uint256 tokenId, uint256 price, Currency currency, uint64 commissionEtaDays) external returns (uint256 listingId) {
        require(commissionEtaDays > 0 && commissionEtaDays <= MAX_COMMISSION_TURNAROUND_DAYS, "invalid eta");
        require(sellerOpenCommissionOrder[msg.sender] == 0, "seller has open order");
        listingId = _createListing(tokenId, price, currency, commissionEtaDays, true);
        sellerActiveCommissionEggListing[msg.sender] = listingId + 1;
    }

    function listEditionForSale(uint256 editionId, uint256 amount, uint256 price, Currency currency) external returns (uint256 listingId) {
        require(price > 0, "price=0");
        require(amount > 0, "amount=0");
        require(editions.balanceOf(msg.sender, editionId) >= amount, "insufficient balance");

        IERC1155(address(editions)).safeTransferFrom(msg.sender, address(this), editionId, amount, "");

        listingId = nextEditionListingId++;
        editionListings[listingId] = EditionListingInfo({
            seller: msg.sender,
            editionId: editionId,
            remainingAmount: amount,
            price: price,
            currency: currency,
            active: true
        });
        emit EditionListingCreated(listingId, msg.sender, editionId, amount, currency);
    }

    function buyAvax(uint256 listingId) external payable nonReentrant {
        _buy(listingId, Currency.Avax, msg.value, "", "");
    }

    function buyUsdc(uint256 listingId) external nonReentrant {
        ListingInfo memory listing = listings[listingId];
        require(listing.active, "listing inactive");
        require(!listing.isCommissionEgg, "use commission buy");
        require(listing.currency == Currency.Usdc, "currency mismatch");
        usdc.safeTransferFrom(msg.sender, address(this), listing.price);
        _buy(listingId, Currency.Usdc, listing.price, "", "");
    }

    function buyCommissionAvax(uint256 listingId, string calldata intention, string calldata referenceImageUrl) external payable nonReentrant {
        _buy(listingId, Currency.Avax, msg.value, intention, referenceImageUrl);
    }

    function buyCommissionUsdc(uint256 listingId, string calldata intention, string calldata referenceImageUrl) external nonReentrant {
        ListingInfo memory listing = listings[listingId];
        require(listing.active, "listing inactive");
        require(listing.isCommissionEgg, "listing not commission");
        require(listing.currency == Currency.Usdc, "currency mismatch");
        usdc.safeTransferFrom(msg.sender, address(this), listing.price);
        _buy(listingId, Currency.Usdc, listing.price, intention, referenceImageUrl);
    }

    function buyEditionAvax(uint256 listingId) external payable nonReentrant {
        _buyEdition(listingId, Currency.Avax, msg.value);
    }

    function buyEditionUsdc(uint256 listingId) external nonReentrant {
        EditionListingInfo memory listing = editionListings[listingId];
        require(listing.active, "listing inactive");
        require(listing.currency == Currency.Usdc, "currency mismatch");
        usdc.safeTransferFrom(msg.sender, address(this), listing.price);
        _buyEdition(listingId, Currency.Usdc, listing.price);
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        ListingInfo storage listing = listings[listingId];
        require(listing.active, "listing inactive");
        require(listing.seller == msg.sender, "not seller");
        listing.active = false;
        if (listing.isCommissionEgg) {
            sellerActiveCommissionEggListing[msg.sender] = 0;
        }
        nft.transferFrom(address(this), msg.sender, listing.tokenId);
    }

    function cancelEditionListing(uint256 listingId) external nonReentrant {
        EditionListingInfo storage listing = editionListings[listingId];
        require(listing.active, "listing inactive");
        require(listing.seller == msg.sender, "not seller");

        uint256 remainingAmount = listing.remainingAmount;
        listing.active = false;
        listing.remainingAmount = 0;
        IERC1155(address(editions)).safeTransferFrom(address(this), msg.sender, listing.editionId, remainingAmount, "");
    }

    function markCommissionDelivered(uint256 orderId) external {
        CommissionOrder storage order = commissionOrders[orderId];
        require(order.seller == msg.sender, "not seller");
        require(order.status == CommissionOrderStatus.Accepted, "bad status");
        order.status = CommissionOrderStatus.Delivered;
        order.deliveredAt = uint64(block.timestamp);
        order.lastDeliveredMetadataUri = nft.tokenURI(order.tokenId);
    }

    function approveCommissionDelivery(uint256 orderId) external nonReentrant {
        CommissionOrder storage order = commissionOrders[orderId];
        require(order.buyer == msg.sender, "not buyer");
        require(order.status == CommissionOrderStatus.Delivered, "bad status");
        _releaseEscrow(order);
        order.status = CommissionOrderStatus.Completed;
        order.resolvedAt = uint64(block.timestamp);
        sellerOpenCommissionOrder[order.seller] = 0;
    }

    function requestCommissionRevision(uint256 orderId, string calldata intention, string calldata referenceImageUrl) external {
        CommissionOrder storage order = commissionOrders[orderId];
        require(order.buyer == msg.sender, "not buyer");
        require(order.status == CommissionOrderStatus.Delivered, "bad status");
        require(order.revisionRequestCount < order.maxRevisionRequests, "revision cap");
        _validateCommissionPayload(intention, referenceImageUrl);

        order.latestRevisionIntention = intention;
        order.latestRevisionRefUrl = referenceImageUrl;
        order.revisionRequestCount += 1;
        order.status = CommissionOrderStatus.Accepted;
    }

    function claimCommissionTimeout(uint256 orderId) external nonReentrant {
        CommissionOrder storage order = commissionOrders[orderId];
        require(order.seller == msg.sender, "not seller");
        require(order.status == CommissionOrderStatus.Delivered, "bad status");
        require(block.timestamp >= order.deliveredAt + COMMISSION_AUTO_RELEASE_AFTER_DELIVERY_SECS, "too early");
        _releaseEscrow(order);
        order.status = CommissionOrderStatus.Completed;
        order.resolvedAt = uint64(block.timestamp);
        sellerOpenCommissionOrder[order.seller] = 0;
    }

    function refundCommissionOrder(uint256 orderId) external nonReentrant {
        CommissionOrder storage order = commissionOrders[orderId];
        require(msg.sender == owner() || msg.sender == order.buyer, "not authorized");
        require(order.status == CommissionOrderStatus.Accepted || order.status == CommissionOrderStatus.Delivered, "bad status");
        _refundEscrow(order);
        order.status = CommissionOrderStatus.Refunded;
        order.resolvedAt = uint64(block.timestamp);
        sellerOpenCommissionOrder[order.seller] = 0;
    }

    function totalListings() external view returns (uint256) {
        return nextListingId;
    }

    function totalEditionListings() external view returns (uint256) {
        return nextEditionListingId;
    }

    function totalCommissionOrders() external view returns (uint256) {
        return nextCommissionOrderId;
    }

    function getListing(uint256 listingId) external view returns (ListingInfo memory) {
        return listings[listingId];
    }

    function getEditionListing(uint256 listingId) external view returns (EditionListingInfo memory) {
        return editionListings[listingId];
    }

    function getCommissionOrder(uint256 orderId) external view returns (CommissionOrder memory) {
        return commissionOrders[orderId];
    }

    function _createListing(uint256 tokenId, uint256 price, Currency currency, uint64 commissionEtaDays, bool isCommissionEgg) internal returns (uint256 listingId) {
        require(price > 0, "price=0");
        require(nft.ownerOf(tokenId) == msg.sender, "not owner");
        nft.transferFrom(msg.sender, address(this), tokenId);

        listingId = nextListingId++;
        listings[listingId] = ListingInfo({
            seller: msg.sender,
            tokenId: tokenId,
            price: price,
            currency: currency,
            commissionEtaDays: commissionEtaDays,
            isCommissionEgg: isCommissionEgg,
            active: true
        });
        emit ListingCreated(listingId, msg.sender, tokenId, isCommissionEgg);
    }

    function _buy(uint256 listingId, Currency paymentCurrency, uint256 amount, string memory intention, string memory referenceImageUrl) internal {
        ListingInfo storage listing = listings[listingId];
        require(listing.active, "listing inactive");
        require(listing.currency == paymentCurrency, "currency mismatch");
        require(amount == listing.price, "incorrect payment");

        listing.active = false;
        if (listing.isCommissionEgg) {
            _validateCommissionPayload(intention, referenceImageUrl);
            _createCommissionOrder(listingId, listing, intention, referenceImageUrl, paymentCurrency, amount);
        } else {
            _payout(listing.seller, paymentCurrency, amount);
        }

        nft.transferFrom(address(this), msg.sender, listing.tokenId);
        emit ListingPurchased(listingId, msg.sender, listing.tokenId, paymentCurrency, listing.isCommissionEgg);
    }

    function _buyEdition(uint256 listingId, Currency paymentCurrency, uint256 amount) internal {
        EditionListingInfo storage listing = editionListings[listingId];
        require(listing.active, "listing inactive");
        require(listing.currency == paymentCurrency, "currency mismatch");
        require(amount == listing.price, "incorrect payment");
        require(listing.remainingAmount > 0, "sold out");

        listing.remainingAmount -= 1;
        if (listing.remainingAmount == 0) {
            listing.active = false;
        }

        _payout(listing.seller, paymentCurrency, amount);
        IERC1155(address(editions)).safeTransferFrom(address(this), msg.sender, listing.editionId, 1, "");
        emit EditionListingPurchased(listingId, msg.sender, listing.editionId, paymentCurrency, listing.remainingAmount);
    }

    function _createCommissionOrder(
        uint256 listingId,
        ListingInfo memory listing,
        string memory intention,
        string memory referenceImageUrl,
        Currency paymentCurrency,
        uint256 amount
    ) internal {
        uint256 upfront = amount / 2;
        uint256 escrow = amount - upfront;
        _payout(listing.seller, paymentCurrency, upfront);

        address escrowHolder = address(this);
        EscrowProvider provider = escrowProvider;

        uint256 orderId = nextCommissionOrderId++;
        commissionOrders[orderId] = CommissionOrder({
            buyer: msg.sender,
            seller: listing.seller,
            listingId: listingId,
            tokenId: listing.tokenId,
            currency: paymentCurrency,
            amountPaid: amount,
            upfrontPaidToSeller: upfront,
            escrowRemaining: escrow,
            escrowProvider: provider,
            escrowHolder: escrowHolder,
            commissionEtaDays: listing.commissionEtaDays,
            intention: intention,
            referenceImageUrl: referenceImageUrl,
            latestRevisionIntention: "",
            latestRevisionRefUrl: "",
            revisionRequestCount: 0,
            maxRevisionRequests: MAX_COMMISSION_REVISION_REQUESTS,
            metadataUriAtPurchase: nft.tokenURI(listing.tokenId),
            lastDeliveredMetadataUri: "",
            status: CommissionOrderStatus.Accepted,
            createdAt: uint64(block.timestamp),
            deliveredAt: 0,
            resolvedAt: 0
        });
        sellerOpenCommissionOrder[listing.seller] = orderId + 1;
        sellerActiveCommissionEggListing[listing.seller] = 0;
        emit CommissionOrderCreated(orderId, listingId, msg.sender, listing.tokenId);
    }

    function _releaseEscrow(CommissionOrder storage order) internal {
        uint256 escrowAmount = order.escrowRemaining;
        order.escrowRemaining = 0;
        _payout(order.seller, order.currency, escrowAmount);
    }

    function _refundEscrow(CommissionOrder storage order) internal {
        uint256 escrowAmount = order.escrowRemaining;
        order.escrowRemaining = 0;
        _payout(order.buyer, order.currency, escrowAmount);
    }

    function _payout(address to, Currency currency, uint256 amount) internal {
        if (amount == 0) return;
        if (currency == Currency.Avax) {
            (bool ok,) = payable(to).call{value: amount}("");
            require(ok, "avax payout failed");
        } else {
            usdc.safeTransfer(to, amount);
        }
    }

    function _validateCommissionPayload(string memory intention, string memory referenceImageUrl) internal pure {
        bytes memory intentionBytes = bytes(intention);
        bytes memory refBytes = bytes(referenceImageUrl);
        require(intentionBytes.length > 0 && intentionBytes.length <= MAX_COMMISSION_INTENTION_LEN, "invalid intention");
        require(refBytes.length <= MAX_REFERENCE_IMAGE_URL_LEN, "reference too long");
    }

    receive() external payable {}
}
