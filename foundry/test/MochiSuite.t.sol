// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockPriceOracle} from "../src/MockPriceOracle.sol";
import {MochiNFT} from "../src/MochiNFT.sol";
import {MochiEditions} from "../src/MochiEditions.sol";
import {MochiAuction} from "../src/MochiAuction.sol";
import {MochiMarketplace} from "../src/MochiMarketplace.sol";
import {MochiSwap} from "../src/MochiSwap.sol";
import {MochiCommission} from "../src/MochiCommission.sol";

contract MochiSuiteTest is Test {
    address internal owner = makeAddr("owner");
    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");
    address internal bidder = makeAddr("bidder");
    address internal artist = makeAddr("artist");

    MockUSDC internal usdc;
    MockPriceOracle internal oracle;
    MochiNFT internal nft;
    MochiEditions internal editions;
    MochiAuction internal auction;
    MochiMarketplace internal marketplace;
    MochiSwap internal swap;
    MochiCommission internal commission;

    function setUp() public {
        vm.deal(owner, 1_000 ether);
        vm.deal(seller, 1_000 ether);
        vm.deal(buyer, 1_000 ether);
        vm.deal(bidder, 1_000 ether);
        vm.deal(artist, 1_000 ether);

        vm.startPrank(owner);
        usdc = new MockUSDC(owner);
        oracle = new MockPriceOracle(owner, 2_500 * 1e8);
        nft = new MochiNFT(owner);
        editions = new MochiEditions(owner);
        auction = new MochiAuction(owner, address(nft), address(usdc), address(oracle));
        marketplace = new MochiMarketplace(owner, address(nft), address(editions), address(usdc));
        swap = new MochiSwap(owner, address(nft));
        commission = new MochiCommission(owner, address(usdc));
        usdc.mint(buyer, 1_000_000 * 1e6);
        usdc.mint(bidder, 1_000_000 * 1e6);
        vm.stopPrank();
    }

    function testCreatorCanMintAndUpdateEggMetadata() public {
        vm.startPrank(seller);
        uint256 tokenId = nft.createCommissionEgg("ipfs://egg-1");
        assertEq(nft.ownerOf(tokenId), seller);
        assertEq(nft.creatorOf(tokenId), seller);

        nft.updateTokenUriAsCreator(tokenId, "ipfs://egg-2");
        assertEq(nft.tokenURI(tokenId), "ipfs://egg-2");

        nft.freezeCreatorMetadataUpdates(tokenId);
        vm.expectRevert("creator updates frozen");
        nft.updateTokenUriAsCreator(tokenId, "ipfs://egg-3");
        vm.stopPrank();
    }

    function testMarketplaceRegularSaleWithUsdc() public {
        vm.startPrank(seller);
        uint256 tokenId = nft.createFinishedNft("ipfs://pet-1");
        nft.approve(address(marketplace), tokenId);
        uint256 listingId = marketplace.listForSale(tokenId, 125 * 1e6, MochiMarketplace.Currency.Usdc);
        vm.stopPrank();

        vm.startPrank(buyer);
        usdc.approve(address(marketplace), type(uint256).max);
        marketplace.buyUsdc(listingId);
        vm.stopPrank();

        assertEq(nft.ownerOf(tokenId), buyer);
        assertEq(usdc.balanceOf(seller), 125 * 1e6);
        MochiMarketplace.ListingInfo memory listing = marketplace.getListing(listingId);
        assertEq(listing.seller, seller);
        assertFalse(listing.active);
    }

    function testMarketplaceEditionSaleWithUsdc() public {
        vm.startPrank(owner);
        uint256 editionId = editions.createEdition(seller, 100, "ipfs://bunny-edition", seller);
        vm.stopPrank();

        vm.startPrank(seller);
        editions.setApprovalForAll(address(marketplace), true);
        uint256 listingId = marketplace.listEditionForSale(editionId, 100, 15 * 1e6, MochiMarketplace.Currency.Usdc);
        vm.stopPrank();

        vm.startPrank(buyer);
        usdc.approve(address(marketplace), type(uint256).max);
        marketplace.buyEditionUsdc(listingId);
        vm.stopPrank();

        assertEq(editions.balanceOf(buyer, editionId), 1);
        assertEq(editions.balanceOf(address(marketplace), editionId), 99);
        assertEq(usdc.balanceOf(seller), 15 * 1e6);

        MochiMarketplace.EditionListingInfo memory listing = marketplace.getEditionListing(listingId);
        assertEq(listing.editionId, editionId);
        assertEq(listing.remainingAmount, 99);
        assertTrue(listing.active);
    }

    function testMarketplaceCommissionOrderLifecycle() public {
        vm.startPrank(seller);
        uint256 eggId = nft.createCommissionEgg("ipfs://egg-sale");
        nft.approve(address(marketplace), eggId);
        uint256 listingId = marketplace.listCommissionEgg(eggId, 10 ether, MochiMarketplace.Currency.Avax, 14);
        vm.stopPrank();

        vm.prank(buyer);
        marketplace.buyCommissionAvax{value: 10 ether}(listingId, "Need a fox mochi", "ipfs://reference");

        assertEq(nft.ownerOf(eggId), buyer);
        assertEq(seller.balance, 1_005 ether);

        MochiMarketplace.CommissionOrder memory order = marketplace.getCommissionOrder(0);
        assertEq(order.buyer, buyer);
        assertEq(order.seller, seller);
        assertEq(order.listingId, listingId);
        assertEq(order.tokenId, eggId);
        assertEq(order.amountPaid, 10 ether);
        assertEq(order.upfrontPaidToSeller, 5 ether);
        assertEq(order.escrowRemaining, 5 ether);
        assertEq(uint256(order.status), uint256(MochiMarketplace.CommissionOrderStatus.Accepted));

        vm.startPrank(seller);
        nft.updateTokenUriAsCreator(eggId, "ipfs://delivered");
        vm.stopPrank();

        vm.prank(seller);
        marketplace.markCommissionDelivered(0);

        vm.prank(buyer);
        marketplace.approveCommissionDelivery(0);

        assertEq(seller.balance, 1_010 ether);
        MochiMarketplace.CommissionOrder memory finalOrder = marketplace.getCommissionOrder(0);
        assertEq(finalOrder.escrowRemaining, 0);
        assertEq(uint256(finalOrder.status), uint256(MochiMarketplace.CommissionOrderStatus.Completed));
    }

    function testAuctionAcceptsHigherAvaxBidAndFinalizes() public {
        vm.startPrank(seller);
        uint256 tokenId = nft.createFinishedNft("ipfs://auctioned");
        nft.approve(address(auction), tokenId);
        uint256 auctionId = auction.createItemAuction(tokenId, 1 ether, MochiAuction.Currency.Avax, 3 days);
        vm.stopPrank();

        vm.prank(buyer);
        auction.bidAvax{value: 1 ether}(auctionId);

        vm.prank(bidder);
        auction.bidAvax{value: 1.1 ether}(auctionId);

        (address highestBidder, uint256 highestAmount,) = auction.highestBids(auctionId);
        assertEq(highestBidder, bidder);
        assertEq(highestAmount, 1.1 ether);

        vm.warp(block.timestamp + 3 days + 1);
        uint256 sellerBalanceBefore = seller.balance;
        auction.finalizeAuction(auctionId);

        assertEq(nft.ownerOf(tokenId), bidder);
        assertEq(seller.balance, sellerBalanceBefore + 1.1 ether);
    }

    function testSwapListingBidAcceptLifecycle() public {
        vm.startPrank(seller);
        uint256 offeredTokenId = nft.createFinishedNft("ipfs://mushroom");
        nft.setApprovalForAll(address(swap), true);
        uint256 listingId = swap.createSwapListing(offeredTokenId, "Swap for a different rare mochi");
        vm.stopPrank();

        vm.startPrank(bidder);
        uint256 bidderTokenId = nft.createFinishedNft("ipfs://fox");
        nft.setApprovalForAll(address(swap), true);
        uint256 bidId = swap.placeSwapBid(listingId, bidderTokenId);
        vm.stopPrank();

        vm.prank(seller);
        swap.acceptSwapBid(listingId, bidId);

        assertEq(nft.ownerOf(offeredTokenId), bidder);
        assertEq(nft.ownerOf(bidderTokenId), seller);

        MochiSwap.SwapListing memory listing = swap.getSwapListing(listingId);
        MochiSwap.SwapBid memory bid = swap.getSwapBid(bidId);
        assertFalse(listing.active);
        assertFalse(bid.active);
    }

    function testStandaloneCommissionUsdcLifecycle() public {
        vm.startPrank(buyer);
        usdc.approve(address(commission), type(uint256).max);
        uint256 commissionId = commission.createCommission(
            "A sleepy cat",
            "ipfs://ref",
            2 ether,
            250 * 1e6,
            125 * 1e8,
            MochiCommission.Currency.Usdc
        );
        vm.stopPrank();

        vm.prank(owner);
        commission.assignArtist(commissionId, artist, 77);

        vm.prank(artist);
        commission.markDelivered(commissionId);

        uint256 artistUsdcBefore = usdc.balanceOf(artist);
        vm.prank(buyer);
        commission.approveDelivery(commissionId);
        assertEq(usdc.balanceOf(artist), artistUsdcBefore + 250 * 1e6);
    }
}
