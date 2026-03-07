// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {LoadConfig} from "script/utils/LoadConfig.s.sol";
import {ChainConfig} from "src/config/ChainConfig.sol";
import {YieldReceiver} from "src/YieldReceiver.sol";
import {YieldVault} from "src/YieldVault.sol";

contract Deploy is Script, LoadConfig {
    struct DeployParams {
        address owner;
        address forwarder;
        address homeUsdc;
        address polygonUsdc;
        address polygonPool;
        address polygonAToken;
        address arbitrumUsdc;
        address arbitrumPool;
        address arbitrumAToken;
    }

    function run() external {
        ChainConfig.HomeChainConfig memory home = homeChainConfig();
        DeployParams memory p = _loadParams();

        vm.startBroadcast();

        YieldReceiver polygonReceiver = new YieldReceiver(
            p.owner,
            ChainConfig.ROUTER_POLYGON_AMOY,
            p.polygonPool,
            p.polygonUsdc,
            p.polygonAToken,
            home.chainSelector,
            address(0)
        );

        YieldReceiver arbitrumReceiver = new YieldReceiver(
            p.owner,
            ChainConfig.ROUTER_ARBITRUM_SEPOLIA,
            p.arbitrumPool,
            p.arbitrumUsdc,
            p.arbitrumAToken,
            home.chainSelector,
            address(0)
        );

        require(home.ccipRouter != address(0), "home router not configured");
        YieldVault vault = new YieldVault(p.owner, home.ccipRouter, p.homeUsdc, p.forwarder, "polygonAmoy");

        vault.setChainConfig("polygonAmoy", ChainConfig.SELECTOR_POLYGON_AMOY, address(polygonReceiver));
        vault.setChainConfig("arbitrumSepolia", ChainConfig.SELECTOR_ARBITRUM_SEPOLIA, address(arbitrumReceiver));

        polygonReceiver.setTrustedVault(address(vault));
        arbitrumReceiver.setTrustedVault(address(vault));

        vm.stopBroadcast();

        console2.log("HOME_CHAIN_MODE", home.mode);
        console2.log("HOME_CHAIN", home.chainName);
        console2.log("HOME_ROUTER", home.ccipRouter);
        console2.log("VAULT", address(vault));
        console2.log("POLYGON_RECEIVER", address(polygonReceiver));
        console2.log("ARBITRUM_RECEIVER", address(arbitrumReceiver));
    }

    function _loadParams() internal view returns (DeployParams memory p) {
        p.owner = vm.envAddress("OWNER");
        p.forwarder = vm.envAddress("CRE_FORWARDER");
        p.homeUsdc = vm.envAddress("HOME_USDC");

        p.polygonUsdc = vm.envAddress("POLYGON_USDC");
        p.polygonPool = vm.envAddress("POLYGON_POOL");
        p.polygonAToken = vm.envAddress("POLYGON_A_TOKEN");

        p.arbitrumUsdc = vm.envAddress("ARBITRUM_USDC");
        p.arbitrumPool = vm.envAddress("ARBITRUM_POOL");
        p.arbitrumAToken = vm.envAddress("ARBITRUM_A_TOKEN");
    }
}
