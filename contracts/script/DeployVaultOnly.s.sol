// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {YieldVault} from "src/YieldVault.sol";

contract DeployVaultOnly is Script {
    function run() external returns (YieldVault vault) {
        address owner = vm.envAddress("OWNER");
        address usdc = vm.envAddress("HOME_USDC");
        address forwarder = vm.envOr("CRE_FORWARDER", owner);
        address router = vm.envOr("HOME_ROUTER_OVERRIDE", address(0x000000000000000000000000000000000000dEaD));
        string memory initialYieldChain = vm.envOr("INITIAL_YIELD_CHAIN", string(""));

        vm.startBroadcast();
        vault = new YieldVault(owner, router, usdc, forwarder, initialYieldChain);
        vm.stopBroadcast();

        console2.log("VAULT_ONLY_OWNER", owner);
        console2.log("VAULT_ONLY_USDC", usdc);
        console2.log("VAULT_ONLY_ROUTER", router);
        console2.log("VAULT_ONLY_FORWARDER", forwarder);
        console2.log("VAULT_ONLY_INITIAL_CHAIN", initialYieldChain);
        console2.log("VAULT_ONLY_ADDRESS", address(vault));
    }
}
