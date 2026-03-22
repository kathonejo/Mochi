// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract MochiEditions is ERC1155, Ownable {
    uint256 public nextEditionId;
    address public minter;

    mapping(uint256 => string) private _editionUris;
    mapping(uint256 => address) public creatorOf;
    mapping(uint256 => uint256) public totalSupplyOf;

    constructor(address initialOwner) ERC1155("") Ownable(initialOwner) {}

    function setMinter(address nextMinter) external onlyOwner {
        minter = nextMinter;
    }

    function createEdition(
        address to,
        uint256 amount,
        string calldata metadataUri,
        address creator
    ) external returns (uint256 editionId) {
        require(amount > 0, "amount=0");
        require(bytes(metadataUri).length >= 7, "tokenUri too short");
        if (minter == address(0)) {
            require(msg.sender == owner(), "not owner");
        } else {
            require(msg.sender == minter, "not minter");
        }

        editionId = nextEditionId++;
        _editionUris[editionId] = metadataUri;
        creatorOf[editionId] = creator;
        totalSupplyOf[editionId] = amount;
        _mint(to, editionId, amount, "");
    }

    function setEditionUri(uint256 editionId, string calldata newUri) external onlyOwner {
        require(editionId < nextEditionId, "edition does not exist");
        require(bytes(newUri).length >= 7, "tokenUri too short");
        _editionUris[editionId] = newUri;
        emit URI(newUri, editionId);
    }

    function uri(uint256 editionId) public view override returns (string memory) {
        return _editionUris[editionId];
    }

    function totalEditions() external view returns (uint256) {
        return nextEditionId;
    }
}
