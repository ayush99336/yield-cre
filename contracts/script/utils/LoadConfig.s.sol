// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {ChainConfig} from "src/config/ChainConfig.sol";

abstract contract LoadConfig is Script {
    function homeChainMode() internal view returns (string memory) {
        string memory mode = vm.envOr("HOME_CHAIN_MODE", string(ChainConfig.HOME_MODE_WORLD));
        bytes32 modeHash = keccak256(bytes(mode));
        if (
            modeHash != keccak256(bytes(ChainConfig.HOME_MODE_WORLD))
                && modeHash != keccak256(bytes(ChainConfig.HOME_MODE_ETH))
        ) {
            revert("HOME_CHAIN_MODE must be world or eth");
        }
        return mode;
    }

    function homeChainConfig() internal view returns (ChainConfig.HomeChainConfig memory) {
        return ChainConfig.getHomeChainConfig(homeChainMode());
    }
}
