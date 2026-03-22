// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract MochiNFT is ERC721URIStorage, Ownable {
    enum TokenKind {
        Finished,
        CommissionEgg
    }

    uint256 public nextTokenId;
    address public minter;
    address public metadataUpdater;

    mapping(uint256 => address) public creatorOf;
    mapping(uint256 => TokenKind) public tokenKindOf;
    mapping(uint256 => bool) public creatorCanUpdateMetadata;

    constructor(address initialOwner) ERC721("Mochi", "MOCHI") Ownable(initialOwner) {}

    function setMinter(address nextMinter) external onlyOwner {
        minter = nextMinter;
    }

    function setMetadataUpdater(address updater) external onlyOwner {
        metadataUpdater = updater;
    }

    function mint(address to, string calldata tokenUri) external returns (uint256) {
        if (minter == address(0)) {
            require(msg.sender == owner(), "not owner");
        } else {
            require(msg.sender == minter, "not minter");
        }
        return _mintInternal(to, tokenUri, to, TokenKind.Finished, false);
    }

    function mintCommissionEgg(address to, address creator, string calldata tokenUri) external onlyOwner returns (uint256) {
        return _mintInternal(to, tokenUri, creator, TokenKind.CommissionEgg, true);
    }

    function createCommissionEgg(string calldata tokenUri) external returns (uint256) {
        return _mintInternal(msg.sender, tokenUri, msg.sender, TokenKind.CommissionEgg, true);
    }

    function createFinishedNft(string calldata tokenUri) external returns (uint256) {
        return _mintInternal(msg.sender, tokenUri, msg.sender, TokenKind.Finished, true);
    }

    function updateTokenUri(uint256 tokenId, string calldata newUri) external {
        require(_ownerOf(tokenId) != address(0), "token missing");
        if (metadataUpdater == address(0)) {
            require(msg.sender == owner(), "not owner");
        } else {
            require(msg.sender == metadataUpdater || msg.sender == owner(), "not updater");
        }
        _setTokenURI(tokenId, newUri);
    }

    function updateTokenUriAsCreator(uint256 tokenId, string calldata newUri) external {
        require(_ownerOf(tokenId) != address(0), "token missing");
        require(creatorOf[tokenId] == msg.sender, "not creator");
        require(creatorCanUpdateMetadata[tokenId], "creator updates frozen");
        _setTokenURI(tokenId, newUri);
    }

    function freezeCreatorMetadataUpdates(uint256 tokenId) external {
        require(_ownerOf(tokenId) != address(0), "token missing");
        require(creatorOf[tokenId] == msg.sender, "not creator");
        creatorCanUpdateMetadata[tokenId] = false;
    }

    function transfer(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId);
    }

    function isCommissionEgg(uint256 tokenId) external view returns (bool) {
        return tokenKindOf[tokenId] == TokenKind.CommissionEgg;
    }

    function totalSupply() external view returns (uint256) {
        return nextTokenId;
    }

    function _mintInternal(
        address to,
        string calldata tokenUri,
        address creator,
        TokenKind kind,
        bool canUpdateMetadata
    ) internal returns (uint256 tokenId) {
        require(bytes(tokenUri).length >= 7, "tokenUri too short");
        tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenUri);
        creatorOf[tokenId] = creator;
        tokenKindOf[tokenId] = kind;
        creatorCanUpdateMetadata[tokenId] = canUpdateMetadata;
    }
}
