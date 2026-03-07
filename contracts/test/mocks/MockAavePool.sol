// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAavePool} from "src/interfaces/IAavePool.sol";
import {MockERC20} from "test/mocks/MockERC20.sol";

contract MockAavePool is IAavePool {
    IERC20 public immutable usdc;
    MockERC20 public immutable aToken;

    constructor(address usdcToken, address aTokenAddress) {
        usdc = IERC20(usdcToken);
        aToken = MockERC20(aTokenAddress);
    }

    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external {
        require(asset == address(usdc), "invalid asset");
        usdc.transferFrom(msg.sender, address(this), amount);
        aToken.mint(onBehalfOf, amount);
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        require(asset == address(usdc), "invalid asset");

        uint256 amountToWithdraw = amount;
        if (amount == type(uint256).max) {
            amountToWithdraw = aToken.balanceOf(msg.sender);
        }

        aToken.burn(msg.sender, amountToWithdraw);
        usdc.transfer(to, amountToWithdraw);
        return amountToWithdraw;
    }
}
