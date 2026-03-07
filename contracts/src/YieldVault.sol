// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ICcipRouter} from "src/interfaces/ICcipRouter.sol";

contract YieldVault is Ownable {
    ICcipRouter public immutable ccipRouter;
    IERC20 public immutable usdc;

    address public creForwarder;
    string public currentYieldChain;

    mapping(address => uint256) public shares;
    uint256 public totalShares;

    mapping(string => uint64) public chainSelectors;
    mapping(string => address) public yieldReceivers;

    event Deposited(address indexed user, uint256 amount, uint256 mintedShares);
    event Withdrawn(address indexed user, uint256 sharesBurned, uint256 amountOut);
    event RebalanceInitiated(string indexed oldChain, string indexed newChain);
    event ForwarderUpdated(address indexed newForwarder);
    event ChainConfigUpdated(string indexed chain, uint64 selector, address receiver);

    error ZeroAmount();
    error InvalidShares();
    error NotAuthorized();

    modifier onlyRebalanceAuthority() {
        if (msg.sender != creForwarder && msg.sender != owner()) {
            revert NotAuthorized();
        }
        _;
    }

    constructor(
        address owner,
        address router,
        address usdcToken,
        address forwarder,
        string memory initialYieldChain
    ) Ownable(owner) {
        ccipRouter = ICcipRouter(router);
        usdc = IERC20(usdcToken);
        creForwarder = forwarder;
        currentYieldChain = initialYieldChain;
    }

    function setCreForwarder(address forwarder) external onlyOwner {
        creForwarder = forwarder;
        emit ForwarderUpdated(forwarder);
    }

    function setChainConfig(string calldata chain, uint64 selector, address receiver) external onlyOwner {
        chainSelectors[chain] = selector;
        yieldReceivers[chain] = receiver;
        emit ChainConfigUpdated(chain, selector, receiver);
    }

    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        uint256 totalAssetsBefore = totalAssets();
        usdc.transferFrom(msg.sender, address(this), amount);

        uint256 mintedShares;
        if (totalShares == 0 || totalAssetsBefore == 0) {
            mintedShares = amount;
        } else {
            mintedShares = (amount * totalShares) / totalAssetsBefore;
        }

        shares[msg.sender] += mintedShares;
        totalShares += mintedShares;

        emit Deposited(msg.sender, amount, mintedShares);
    }

    function withdraw(uint256 shareAmount) external {
        if (shareAmount == 0) revert ZeroAmount();
        if (shares[msg.sender] < shareAmount) revert InvalidShares();

        uint256 assets = totalAssets();
        uint256 amountOut = (shareAmount * assets) / totalShares;

        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;

        usdc.transfer(msg.sender, amountOut);
        emit Withdrawn(msg.sender, shareAmount, amountOut);
    }

    function initiateRebalance(string calldata newChain) external onlyRebalanceAuthority {
        string memory oldChain = currentYieldChain;
        currentYieldChain = newChain;
        emit RebalanceInitiated(oldChain, newChain);
    }

    function totalAssets() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function getUserBalance(address user) external view returns (uint256) {
        if (totalShares == 0) return 0;
        return (shares[user] * totalAssets()) / totalShares;
    }
}
