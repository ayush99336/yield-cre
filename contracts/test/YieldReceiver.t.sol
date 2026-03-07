// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ICcipRouter} from "src/interfaces/ICcipRouter.sol";
import {MessageCodec} from "src/libraries/MessageCodec.sol";
import {YieldReceiver} from "src/YieldReceiver.sol";
import {MockAavePool} from "test/mocks/MockAavePool.sol";
import {MockERC20} from "test/mocks/MockERC20.sol";
import {MockRouter} from "test/mocks/MockRouter.sol";

contract YieldReceiverTest is Test {
    using MessageCodec for MessageCodec.BridgeMessage;

    address internal owner = makeAddr("owner");
    address internal vault = makeAddr("vault");
    uint64 internal homeSelector = 16015286601757825753;

    MockRouter internal router;
    MockERC20 internal usdc;
    MockERC20 internal aToken;
    MockAavePool internal pool;
    YieldReceiver internal receiver;

    function setUp() external {
        router = new MockRouter();
        usdc = new MockERC20("USDC", "USDC");
        aToken = new MockERC20("aUSDC", "aUSDC");
        pool = new MockAavePool(address(usdc), address(aToken));

        receiver = new YieldReceiver(
            owner, address(router), address(pool), address(usdc), address(aToken), homeSelector, vault
        );
    }

    function testDepositMessageSuppliesToAave() external {
        usdc.mint(address(receiver), 500e6);

        MessageCodec.BridgeMessage memory payload = MessageCodec.BridgeMessage({
            messageType: MessageCodec.MessageType.DEPOSIT,
            user: address(0),
            amount: 500e6,
            shares: 0,
            targetChain: "polygonAmoy"
        });

        ICcipRouter.EVMTokenAmount[] memory tokenAmounts = new ICcipRouter.EVMTokenAmount[](1);
        tokenAmounts[0] = ICcipRouter.EVMTokenAmount({token: address(usdc), amount: 500e6});

        ICcipRouter.Any2EVMMessage memory msgData = ICcipRouter.Any2EVMMessage({
            messageId: bytes32(uint256(1)),
            sourceChainSelector: homeSelector,
            sender: abi.encode(vault),
            data: payload.encode(),
            destTokenAmounts: tokenAmounts
        });

        router.deliver(address(receiver), msgData);
        assertEq(aToken.balanceOf(address(receiver)), 500e6);
    }

    function testRejectInvalidSender() external {
        MessageCodec.BridgeMessage memory payload = MessageCodec.BridgeMessage({
            messageType: MessageCodec.MessageType.DEPOSIT,
            user: address(0),
            amount: 0,
            shares: 0,
            targetChain: "polygonAmoy"
        });

        ICcipRouter.Any2EVMMessage memory msgData = ICcipRouter.Any2EVMMessage({
            messageId: bytes32(uint256(2)),
            sourceChainSelector: homeSelector,
            sender: abi.encode(makeAddr("badSender")),
            data: payload.encode(),
            destTokenAmounts: new ICcipRouter.EVMTokenAmount[](0)
        });

        vm.expectRevert(YieldReceiver.InvalidSourceSender.selector);
        router.deliver(address(receiver), msgData);
    }
}
