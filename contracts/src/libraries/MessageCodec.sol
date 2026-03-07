// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library MessageCodec {
    enum MessageType {
        DEPOSIT,
        WITHDRAW_ALL,
        WITHDRAW_FOR_USER,
        REBALANCE_COMPLETE,
        WITHDRAW_COMPLETE
    }

    struct BridgeMessage {
        MessageType messageType;
        address user;
        uint256 amount;
        uint256 shares;
        string targetChain;
    }

    function encode(BridgeMessage memory payload) internal pure returns (bytes memory) {
        return abi.encode(payload);
    }

    function decode(bytes memory payload) internal pure returns (BridgeMessage memory) {
        return abi.decode(payload, (BridgeMessage));
    }
}
