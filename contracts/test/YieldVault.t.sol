// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ICcipRouter} from "src/interfaces/ICcipRouter.sol";
import {MessageCodec} from "src/libraries/MessageCodec.sol";
import {YieldVault} from "src/YieldVault.sol";
import {MockERC20} from "test/mocks/MockERC20.sol";
import {MockRouter} from "test/mocks/MockRouter.sol";

contract YieldVaultTest is Test {
    using MessageCodec for MessageCodec.BridgeMessage;

    address internal owner = makeAddr("owner");
    address internal forwarder = makeAddr("forwarder");
    address internal user = makeAddr("user");
    address internal polygonReceiver = makeAddr("polygonReceiver");
    address internal arbReceiver = makeAddr("arbReceiver");

    MockRouter internal router;
    MockERC20 internal usdc;
    YieldVault internal vault;

    function setUp() external {
        router = new MockRouter();
        usdc = new MockERC20("USDC", "USDC");
        vault = new YieldVault(owner, address(router), address(usdc), forwarder, "");

        vm.prank(owner);
        vault.setChainConfig("polygonAmoy", 16281711391670634445, polygonReceiver);
        vm.prank(owner);
        vault.setChainConfig("arbitrumSepolia", 3478487238524512106, arbReceiver);

        usdc.mint(user, 1_000_000e6);
    }

    function testDepositAndLocalWithdrawAccounting() external {
        vm.startPrank(user);
        usdc.approve(address(vault), 1000e6);
        vault.deposit(1000e6);

        assertEq(vault.totalAssets(), 1000e6);
        assertEq(vault.shares(user), 1000e6);

        vault.withdraw(200e6);
        vm.stopPrank();

        assertEq(vault.totalAssets(), 800e6);
        assertEq(vault.shares(user), 800e6);
        assertEq(usdc.balanceOf(user), 999_200e6);
    }

    function testRebalanceAuth() external {
        vm.prank(user);
        vm.expectRevert(YieldVault.NotAuthorized.selector);
        vault.initiateRebalance("arbitrumSepolia");

        vm.prank(forwarder);
        vault.initiateRebalance("arbitrumSepolia");
        assertEq(vault.currentYieldChain(), "arbitrumSepolia");
    }

    function testRejectInvalidCcipSource() external {
        MessageCodec.BridgeMessage memory payload = MessageCodec.BridgeMessage({
            messageType: MessageCodec.MessageType.WITHDRAW_COMPLETE,
            user: user,
            amount: 100e6,
            shares: 100e6,
            targetChain: "polygonAmoy"
        });

        ICcipRouter.Any2EVMMessage memory msgData = ICcipRouter.Any2EVMMessage({
            messageId: bytes32(uint256(1)),
            sourceChainSelector: 999,
            sender: abi.encode(polygonReceiver),
            data: payload.encode(),
            destTokenAmounts: new ICcipRouter.EVMTokenAmount[](0)
        });

        vm.expectRevert(YieldVault.InvalidSourceSelector.selector);
        router.deliver(address(vault), msgData);
    }

    function testRebalanceLifecycleUpdatesChainOnCompletion() external {
        vm.startPrank(user);
        usdc.approve(address(vault), 1000e6);
        vault.deposit(1000e6);
        vm.stopPrank();

        vm.prank(owner);
        vault.initiateRebalance("polygonAmoy");
        assertEq(vault.currentYieldChain(), "polygonAmoy");

        vm.prank(owner);
        vault.initiateRebalance("arbitrumSepolia");
        assertEq(vault.pendingRebalanceChain(), "arbitrumSepolia");

        MessageCodec.BridgeMessage memory payload = MessageCodec.BridgeMessage({
            messageType: MessageCodec.MessageType.REBALANCE_COMPLETE,
            user: address(0),
            amount: 0,
            shares: 0,
            targetChain: "arbitrumSepolia"
        });

        ICcipRouter.Any2EVMMessage memory msgData = ICcipRouter.Any2EVMMessage({
            messageId: bytes32(uint256(2)),
            sourceChainSelector: 16281711391670634445,
            sender: abi.encode(polygonReceiver),
            data: payload.encode(),
            destTokenAmounts: new ICcipRouter.EVMTokenAmount[](0)
        });

        router.deliver(address(vault), msgData);
        assertEq(vault.currentYieldChain(), "arbitrumSepolia");
        assertEq(vault.pendingRebalanceChain(), "");
    }
}
