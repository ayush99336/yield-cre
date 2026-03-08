// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {TestUSDC} from "src/mocks/TestUSDC.sol";

contract DeployTestUSDC is Script {
    function run() external returns (TestUSDC token) {
        vm.startBroadcast();
        token = new TestUSDC();
        vm.stopBroadcast();

        console2.log("TEST_USDC_ADDRESS", address(token));
    }
}
