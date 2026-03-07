// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChainConfig} from "src/config/ChainConfig.sol";

contract ChainConfigTest is Test {
    function testWorldModeConfig() external pure {
        ChainConfig.HomeChainConfig memory cfg = ChainConfig.getHomeChainConfig("world");
        assertEq(cfg.mode, "world");
        assertEq(cfg.chainName, "world-sepolia");
    }

    function testEthModeConfig() external pure {
        ChainConfig.HomeChainConfig memory cfg = ChainConfig.getHomeChainConfig("eth");
        assertEq(cfg.mode, "eth");
        assertEq(cfg.chainSelector, 16015286601757825753);
    }
}
