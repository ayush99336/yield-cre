// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {LoadConfig} from "script/utils/LoadConfig.s.sol";
import {ChainConfig} from "src/config/ChainConfig.sol";

contract Deploy is Script, LoadConfig {
    function run() external {
        ChainConfig.HomeChainConfig memory cfg = homeChainConfig();
        vm.startBroadcast();
        // Contract deployments are added in later stages.
        vm.stopBroadcast();

        console2.log("HOME_CHAIN_MODE", cfg.mode);
        console2.log("HOME_CHAIN", cfg.chainName);
        console2.log("HOME_SELECTOR", cfg.chainSelector);
        console2.log("HOME_ROUTER", cfg.ccipRouter);
    }
}
