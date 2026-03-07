// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICcipRouter {
    struct EVMTokenAmount {
        address token;
        uint256 amount;
    }

    struct GenericExtraArgsV2 {
        uint256 gasLimit;
        bool allowOutOfOrderExecution;
    }

    struct EVM2AnyMessage {
        bytes receiver;
        bytes data;
        EVMTokenAmount[] tokenAmounts;
        address feeToken;
        bytes extraArgs;
    }

    struct Any2EVMMessage {
        bytes32 messageId;
        uint64 sourceChainSelector;
        bytes sender;
        bytes data;
        EVMTokenAmount[] destTokenAmounts;
    }

    function getFee(uint64 destinationChainSelector, EVM2AnyMessage calldata message)
        external
        view
        returns (uint256);

    function ccipSend(uint64 destinationChainSelector, EVM2AnyMessage calldata message)
        external
        payable
        returns (bytes32);
}
