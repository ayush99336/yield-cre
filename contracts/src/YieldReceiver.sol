// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IAavePool} from "src/interfaces/IAavePool.sol";
import {ICcipRouter} from "src/interfaces/ICcipRouter.sol";
import {MessageCodec} from "src/libraries/MessageCodec.sol";

contract YieldReceiver is Ownable {
    using MessageCodec for MessageCodec.BridgeMessage;

    uint256 public constant CCIP_GAS_LIMIT = 500_000;

    ICcipRouter public immutable ccipRouter;
    IAavePool public immutable aavePool;
    IERC20 public immutable usdc;
    IERC20 public immutable aToken;

    uint64 public immutable trustedSourceSelector;
    address public trustedVault;

    event CcipMessageProcessed(bytes32 indexed messageId, MessageCodec.MessageType messageType, uint256 amount);
    event AssetsSupplied(uint256 amount);
    event AssetsWithdrawn(uint256 amount);
    event CcipReturnSent(bytes32 indexed messageId, MessageCodec.MessageType messageType, uint256 amount);
    event TrustedVaultUpdated(address indexed vault);

    error OnlyRouter();
    error InvalidSourceSelector();
    error InvalidSourceSender();

    constructor(
        address owner,
        address router,
        address pool,
        address usdcToken,
        address aTokenAddress,
        uint64 sourceSelector,
        address sourceVault
    ) Ownable(owner) {
        ccipRouter = ICcipRouter(router);
        aavePool = IAavePool(pool);
        usdc = IERC20(usdcToken);
        aToken = IERC20(aTokenAddress);
        trustedSourceSelector = sourceSelector;
        trustedVault = sourceVault;
    }

    receive() external payable {}

    function setTrustedVault(address newVault) external onlyOwner {
        trustedVault = newVault;
        emit TrustedVaultUpdated(newVault);
    }

    function ccipReceive(ICcipRouter.Any2EVMMessage calldata message) external {
        if (msg.sender != address(ccipRouter)) revert OnlyRouter();
        if (message.sourceChainSelector != trustedSourceSelector) revert InvalidSourceSelector();

        address sourceSender = abi.decode(message.sender, (address));
        if (sourceSender != trustedVault) revert InvalidSourceSender();

        MessageCodec.BridgeMessage memory payload = MessageCodec.decode(message.data);

        if (payload.messageType == MessageCodec.MessageType.DEPOSIT) {
            uint256 amount = _getTransferredAmount(message);
            if (amount > 0) {
                usdc.approve(address(aavePool), amount);
                aavePool.supply(address(usdc), amount, address(this), 0);
                emit AssetsSupplied(amount);
            }
            emit CcipMessageProcessed(message.messageId, payload.messageType, amount);
            return;
        }

        if (payload.messageType == MessageCodec.MessageType.WITHDRAW_ALL) {
            uint256 amount = _withdrawAll();
            _sendBack(MessageCodec.MessageType.REBALANCE_COMPLETE, payload.user, amount, payload.shares, payload.targetChain);
            emit CcipMessageProcessed(message.messageId, payload.messageType, amount);
            return;
        }

        if (payload.messageType == MessageCodec.MessageType.WITHDRAW_FOR_USER) {
            uint256 amount = payload.amount;
            if (amount > 0) {
                aavePool.withdraw(address(usdc), amount, address(this));
                emit AssetsWithdrawn(amount);
            }
            _sendBack(MessageCodec.MessageType.WITHDRAW_COMPLETE, payload.user, amount, payload.shares, payload.targetChain);
            emit CcipMessageProcessed(message.messageId, payload.messageType, amount);
            return;
        }

        revert("unsupported message type");
    }

    function _withdrawAll() internal returns (uint256 amount) {
        uint256 aTokenBal = aToken.balanceOf(address(this));
        if (aTokenBal > 0) {
            aavePool.withdraw(address(usdc), type(uint256).max, address(this));
        }
        amount = usdc.balanceOf(address(this));
        emit AssetsWithdrawn(amount);
    }

    function _sendBack(
        MessageCodec.MessageType messageType,
        address user,
        uint256 amount,
        uint256 shares,
        string memory targetChain
    ) internal {
        MessageCodec.BridgeMessage memory payload = MessageCodec.BridgeMessage({
            messageType: messageType,
            user: user,
            amount: amount,
            shares: shares,
            targetChain: targetChain
        });

        ICcipRouter.EVMTokenAmount[] memory tokenAmounts = new ICcipRouter.EVMTokenAmount[](0);
        if (amount > 0) {
            tokenAmounts = new ICcipRouter.EVMTokenAmount[](1);
            tokenAmounts[0] = ICcipRouter.EVMTokenAmount({token: address(usdc), amount: amount});
            usdc.approve(address(ccipRouter), amount);
        }

        ICcipRouter.EVM2AnyMessage memory msgToHome = ICcipRouter.EVM2AnyMessage({
            receiver: abi.encode(trustedVault),
            data: payload.encode(),
            tokenAmounts: tokenAmounts,
            feeToken: address(0),
            extraArgs: abi.encode(ICcipRouter.GenericExtraArgsV2({
                gasLimit: CCIP_GAS_LIMIT,
                allowOutOfOrderExecution: true
            }))
        });

        uint256 fee = ccipRouter.getFee(trustedSourceSelector, msgToHome);
        bytes32 ccipMsgId = ccipRouter.ccipSend{value: fee}(trustedSourceSelector, msgToHome);
        emit CcipReturnSent(ccipMsgId, messageType, amount);
    }

    function _getTransferredAmount(ICcipRouter.Any2EVMMessage calldata message) internal view returns (uint256) {
        if (message.destTokenAmounts.length == 0) {
            return 0;
        }
        ICcipRouter.EVMTokenAmount calldata transferred = message.destTokenAmounts[0];
        if (transferred.token != address(usdc)) {
            return 0;
        }
        return transferred.amount;
    }
}
