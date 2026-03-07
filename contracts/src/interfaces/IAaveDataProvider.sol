// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAaveDataProvider {
    struct ReserveData {
        uint256 unbacked;
        uint256 accruedToTreasuryScaled;
        uint256 totalAToken;
        uint256 totalStableDebt;
        uint256 totalVariableDebt;
        uint256 liquidityRate;
        uint256 variableBorrowRate;
        uint256 stableBorrowRate;
        uint40 averageStableBorrowRate;
        uint40 liquidityIndex;
        uint40 variableBorrowIndex;
        uint40 lastUpdateTimestamp;
    }

    function getReserveData(address asset)
        external
        view
        returns (
            uint256 unbacked,
            uint256 accruedToTreasuryScaled,
            uint256 totalAToken,
            uint256 totalStableDebt,
            uint256 totalVariableDebt,
            uint256 liquidityRate,
            uint256 variableBorrowRate,
            uint256 stableBorrowRate,
            uint40 averageStableBorrowRate,
            uint40 liquidityIndex,
            uint40 variableBorrowIndex,
            uint40 lastUpdateTimestamp
        );
}
