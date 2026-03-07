// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ICcipRouter} from "src/interfaces/ICcipRouter.sol";
import {MessageCodec} from "src/libraries/MessageCodec.sol";

contract YieldVault is Ownable {
    using SafeERC20 for IERC20;
    using MessageCodec for MessageCodec.BridgeMessage;

    uint256 public constant CCIP_GAS_LIMIT = 500_000;

    ICcipRouter public immutable ccipRouter;
    IERC20 public immutable usdc;

    address public creForwarder;
    string public currentYieldChain;
    string public pendingRebalanceChain;

    mapping(address => uint256) public shares;
    uint256 public totalShares;
    uint256 public managedAssets;

    mapping(string => uint64) public chainSelectors;
    mapping(string => address) public yieldReceivers;
    mapping(uint64 => address) public sourceReceivers;
    mapping(address => uint256) public pendingWithdrawals;

    event Deposited(address indexed user, uint256 amount, uint256 mintedShares);
    event WithdrawRequested(address indexed user, uint256 sharesBurned, uint256 amountOut);
    event Withdrawn(address indexed user, uint256 sharesBurned, uint256 amountOut);
    event RebalanceInitiated(string indexed oldChain, string indexed newChain);
    event RebalanceCompleted(string indexed oldChain, string indexed newChain, uint256 movedAmount);
    event ForwarderUpdated(address indexed newForwarder);
    event ChainConfigUpdated(string indexed chain, uint64 selector, address receiver);
    event CcipMessageSent(
        bytes32 indexed messageId,
        string indexed targetChain,
        MessageCodec.MessageType messageType,
        uint256 tokenAmount
    );
    event CcipMessageReceived(
        bytes32 indexed messageId,
        uint64 indexed sourceSelector,
        MessageCodec.MessageType messageType,
        uint256 tokenAmount
    );

    error ZeroAmount();
    error InvalidShares();
    error NotAuthorized();
    error UnknownChain();
    error InvalidSourceSelector();
    error InvalidSourceSender();
    error UnsupportedMessageType();
    error InsufficientNativeForCcipFee();

    modifier onlyRebalanceAuthority() {
        if (msg.sender != creForwarder && msg.sender != owner()) {
            revert NotAuthorized();
        }
        _;
    }

    constructor(
        address owner,
        address router,
        address usdcToken,
        address forwarder,
        string memory initialYieldChain
    ) Ownable(owner) {
        ccipRouter = ICcipRouter(router);
        usdc = IERC20(usdcToken);
        creForwarder = forwarder;
        currentYieldChain = initialYieldChain;
    }

    receive() external payable {}

    function setCreForwarder(address forwarder) external onlyOwner {
        creForwarder = forwarder;
        emit ForwarderUpdated(forwarder);
    }

    function setChainConfig(string calldata chain, uint64 selector, address receiver) external onlyOwner {
        chainSelectors[chain] = selector;
        yieldReceivers[chain] = receiver;
        sourceReceivers[selector] = receiver;
        emit ChainConfigUpdated(chain, selector, receiver);
    }

    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        uint256 totalAssetsBefore = totalAssets();
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        uint256 mintedShares;
        if (totalShares == 0 || totalAssetsBefore == 0) {
            mintedShares = amount;
        } else {
            mintedShares = (amount * totalShares) / totalAssetsBefore;
        }

        shares[msg.sender] += mintedShares;
        totalShares += mintedShares;
        managedAssets += amount;

        emit Deposited(msg.sender, amount, mintedShares);

        uint64 selector = chainSelectors[currentYieldChain];
        if (selector != 0) {
            _sendCcip(
                currentYieldChain,
                MessageCodec.MessageType.DEPOSIT,
                msg.sender,
                amount,
                0,
                currentYieldChain,
                amount
            );
        }
    }

    function withdraw(uint256 shareAmount) external {
        if (shareAmount == 0) revert ZeroAmount();
        if (shares[msg.sender] < shareAmount) revert InvalidShares();

        uint256 amountOut = (shareAmount * managedAssets) / totalShares;

        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;

        pendingWithdrawals[msg.sender] += amountOut;
        emit WithdrawRequested(msg.sender, shareAmount, amountOut);

        if (usdc.balanceOf(address(this)) >= amountOut) {
            pendingWithdrawals[msg.sender] -= amountOut;
            managedAssets -= amountOut;
            usdc.safeTransfer(msg.sender, amountOut);
            emit Withdrawn(msg.sender, shareAmount, amountOut);
            return;
        }

        _sendCcip(
            currentYieldChain,
            MessageCodec.MessageType.WITHDRAW_FOR_USER,
            msg.sender,
            amountOut,
            shareAmount,
            currentYieldChain,
            0
        );
    }

    function initiateRebalance(string calldata newChain) external onlyRebalanceAuthority {
        if (chainSelectors[newChain] == 0 || yieldReceivers[newChain] == address(0)) {
            revert UnknownChain();
        }

        string memory oldChain = currentYieldChain;
        emit RebalanceInitiated(oldChain, newChain);

        if (bytes(oldChain).length == 0) {
            currentYieldChain = newChain;
            emit RebalanceCompleted("", newChain, 0);
            return;
        }

        pendingRebalanceChain = newChain;
        _sendCcip(
            oldChain,
            MessageCodec.MessageType.WITHDRAW_ALL,
            address(0),
            0,
            0,
            newChain,
            0
        );
    }

    function ccipReceive(ICcipRouter.Any2EVMMessage calldata message) external {
        if (msg.sender != address(ccipRouter)) revert NotAuthorized();

        address expectedSender = sourceReceivers[message.sourceChainSelector];
        if (expectedSender == address(0)) revert InvalidSourceSelector();

        address sourceSender = abi.decode(message.sender, (address));
        if (sourceSender != expectedSender) revert InvalidSourceSender();

        MessageCodec.BridgeMessage memory payload = MessageCodec.decode(message.data);
        uint256 transferredAmount = _getTransferredAmount(message);
        emit CcipMessageReceived(
            message.messageId, message.sourceChainSelector, payload.messageType, transferredAmount
        );

        if (payload.messageType == MessageCodec.MessageType.REBALANCE_COMPLETE) {
            string memory oldChain = currentYieldChain;
            string memory newChain = pendingRebalanceChain;
            if (bytes(newChain).length == 0) revert UnsupportedMessageType();

            if (transferredAmount > 0) {
                _sendCcip(
                    newChain,
                    MessageCodec.MessageType.DEPOSIT,
                    address(0),
                    transferredAmount,
                    0,
                    newChain,
                    transferredAmount
                );
            }

            currentYieldChain = newChain;
            pendingRebalanceChain = "";
            emit RebalanceCompleted(oldChain, newChain, transferredAmount);
            return;
        }

        if (payload.messageType == MessageCodec.MessageType.WITHDRAW_COMPLETE) {
            uint256 expected = pendingWithdrawals[payload.user];
            uint256 payout = transferredAmount > 0 ? transferredAmount : payload.amount;
            if (payout > expected) {
                payout = expected;
            }

            pendingWithdrawals[payload.user] = expected - payout;
            managedAssets -= payout;
            usdc.safeTransfer(payload.user, payout);
            emit Withdrawn(payload.user, payload.shares, payout);
            return;
        }

        revert UnsupportedMessageType();
    }

    function totalAssets() public view returns (uint256) {
        return managedAssets;
    }

    function getUserBalance(address user) external view returns (uint256) {
        if (totalShares == 0) return 0;
        return (shares[user] * totalAssets()) / totalShares;
    }

    function _sendCcip(
        string memory targetChain,
        MessageCodec.MessageType messageType,
        address user,
        uint256 amount,
        uint256 userShares,
        string memory payloadTargetChain,
        uint256 tokenAmount
    ) internal {
        uint64 selector = chainSelectors[targetChain];
        address receiver = yieldReceivers[targetChain];
        if (selector == 0 || receiver == address(0)) revert UnknownChain();

        MessageCodec.BridgeMessage memory payload = MessageCodec.BridgeMessage({
            messageType: messageType,
            user: user,
            amount: amount,
            shares: userShares,
            targetChain: payloadTargetChain
        });

        ICcipRouter.EVMTokenAmount[] memory tokenAmounts = new ICcipRouter.EVMTokenAmount[](0);
        if (tokenAmount > 0) {
            tokenAmounts = new ICcipRouter.EVMTokenAmount[](1);
            tokenAmounts[0] = ICcipRouter.EVMTokenAmount({token: address(usdc), amount: tokenAmount});
            usdc.forceApprove(address(ccipRouter), tokenAmount);
        }

        ICcipRouter.EVM2AnyMessage memory ccipMsg = ICcipRouter.EVM2AnyMessage({
            receiver: abi.encode(receiver),
            data: payload.encode(),
            tokenAmounts: tokenAmounts,
            feeToken: address(0),
            extraArgs: abi.encode(
                ICcipRouter.GenericExtraArgsV2({
                    gasLimit: CCIP_GAS_LIMIT,
                    allowOutOfOrderExecution: true
                })
            )
        });

        uint256 fee = ccipRouter.getFee(selector, ccipMsg);
        if (address(this).balance < fee) revert InsufficientNativeForCcipFee();
        bytes32 msgId = ccipRouter.ccipSend{value: fee}(selector, ccipMsg);
        emit CcipMessageSent(msgId, targetChain, messageType, tokenAmount);
    }

    function _getTransferredAmount(ICcipRouter.Any2EVMMessage calldata message) internal view returns (uint256) {
        if (message.destTokenAmounts.length == 0) return 0;
        ICcipRouter.EVMTokenAmount calldata amount = message.destTokenAmounts[0];
        if (amount.token != address(usdc)) return 0;
        return amount.amount;
    }
}
