// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ICcipRouter} from "src/interfaces/ICcipRouter.sol";

interface ICcipReceivable {
    function ccipReceive(ICcipRouter.Any2EVMMessage calldata message) external;
}

contract MockRouter is ICcipRouter {
    uint256 public flatFee;
    uint256 public nonce;

    uint64 public lastDestinationSelector;
    bytes32 public lastMessageId;
    bytes public lastReceiver;
    bytes public lastData;
    uint256 public lastTokenAmount;

    function setFlatFee(uint256 newFee) external {
        flatFee = newFee;
    }

    function getFee(uint64, EVM2AnyMessage calldata) external view returns (uint256) {
        return flatFee;
    }

    function ccipSend(uint64 destinationChainSelector, EVM2AnyMessage calldata message)
        external
        payable
        returns (bytes32)
    {
        if (message.tokenAmounts.length > 0) {
            IERC20(message.tokenAmounts[0].token).transferFrom(
                msg.sender, address(this), message.tokenAmounts[0].amount
            );
            lastTokenAmount = message.tokenAmounts[0].amount;
        } else {
            lastTokenAmount = 0;
        }

        lastDestinationSelector = destinationChainSelector;
        lastReceiver = message.receiver;
        lastData = message.data;
        lastMessageId = keccak256(abi.encodePacked(block.chainid, msg.sender, ++nonce));
        return lastMessageId;
    }

    function deliver(address target, Any2EVMMessage calldata message) external {
        ICcipReceivable(target).ccipReceive(message);
    }
}
