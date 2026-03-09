// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {YieldReceiver} from "src/YieldReceiver.sol";

contract DeployReceiver is Script {
    function run() external returns (YieldReceiver receiver) {
        address owner = vm.envAddress("OWNER");
        address router = vm.envAddress("DEST_ROUTER");
        address pool = vm.envAddress("DEST_POOL");
        address usdc = vm.envAddress("DEST_USDC");
        address aToken = vm.envAddress("DEST_A_TOKEN");
        uint64 homeSelector = uint64(vm.envUint("HOME_SELECTOR"));
        address trustedVault = vm.envOr("TRUSTED_VAULT", address(0));

        vm.startBroadcast();
        receiver = new YieldReceiver(
            owner,
            router,
            pool,
            usdc,
            aToken,
            homeSelector,
            trustedVault
        );
        vm.stopBroadcast();

        console2.log("RECEIVER_OWNER", owner);
        console2.log("RECEIVER_ROUTER", router);
        console2.log("RECEIVER_POOL", pool);
        console2.log("RECEIVER_USDC", usdc);
        console2.log("RECEIVER_A_TOKEN", aToken);
        console2.log("RECEIVER_HOME_SELECTOR", homeSelector);
        console2.log("RECEIVER_TRUSTED_VAULT", trustedVault);
        console2.log("RECEIVER_ADDRESS", address(receiver));
    }
}
