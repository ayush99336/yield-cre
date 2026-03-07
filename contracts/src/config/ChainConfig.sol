// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library ChainConfig {
    string internal constant HOME_MODE_WORLD = "world";
    string internal constant HOME_MODE_ETH = "eth";

    uint64 internal constant SELECTOR_WORLD_SEPOLIA = 0; // verify from CCIP dir before deploy
    uint64 internal constant SELECTOR_ETH_SEPOLIA = 16015286601757825753;
    uint64 internal constant SELECTOR_POLYGON_AMOY = 16281711391670634445;
    uint64 internal constant SELECTOR_ARBITRUM_SEPOLIA = 3478487238524512106;

    address internal constant ROUTER_WORLD_SEPOLIA = address(0); // TBD from CCIP directory
    address internal constant ROUTER_ETH_SEPOLIA = 0x0BF3De8C394cE7bbcD1a6F6a6F5FD17F2e8A3A59;
    address internal constant ROUTER_POLYGON_AMOY = 0x9C32fCB86BF0f4a1A8921a9Fe46de3198bb884B2;
    address internal constant ROUTER_ARBITRUM_SEPOLIA = 0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165;

    struct HomeChainConfig {
        string mode;
        string chainName;
        uint64 chainSelector;
        address ccipRouter;
    }

    function getHomeChainConfig(string memory mode)
        internal
        pure
        returns (HomeChainConfig memory cfg)
    {
        bytes32 modeHash = keccak256(bytes(mode));
        if (modeHash == keccak256(bytes(HOME_MODE_WORLD))) {
            return HomeChainConfig({
                mode: HOME_MODE_WORLD,
                chainName: "world-sepolia",
                chainSelector: SELECTOR_WORLD_SEPOLIA,
                ccipRouter: ROUTER_WORLD_SEPOLIA
            });
        }

        return HomeChainConfig({
            mode: HOME_MODE_ETH,
            chainName: "ethereum-sepolia",
            chainSelector: SELECTOR_ETH_SEPOLIA,
            ccipRouter: ROUTER_ETH_SEPOLIA
        });
    }
}
