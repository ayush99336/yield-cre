import { decodeFunctionResult, encodeFunctionData, zeroAddress } from 'viem'
import type { Address } from 'viem'
import {
  bytesToHex,
  encodeCallMsg,
  EVMClient,
  LAST_FINALIZED_BLOCK_NUMBER,
  type Runtime,
} from '@chainlink/cre-sdk'

export const AaveDataProviderABI = [
  {
    type: 'function',
    name: 'getReserveData',
    inputs: [{ name: 'asset', type: 'address', internalType: 'address' }],
    outputs: [
      { name: 'unbacked', type: 'uint256', internalType: 'uint256' },
      { name: 'accruedToTreasuryScaled', type: 'uint256', internalType: 'uint256' },
      { name: 'totalAToken', type: 'uint256', internalType: 'uint256' },
      { name: 'totalStableDebt', type: 'uint256', internalType: 'uint256' },
      { name: 'totalVariableDebt', type: 'uint256', internalType: 'uint256' },
      { name: 'liquidityRate', type: 'uint256', internalType: 'uint256' },
      { name: 'variableBorrowRate', type: 'uint256', internalType: 'uint256' },
      { name: 'stableBorrowRate', type: 'uint256', internalType: 'uint256' },
      { name: 'averageStableBorrowRate', type: 'uint40', internalType: 'uint40' },
      { name: 'liquidityIndex', type: 'uint40', internalType: 'uint40' },
      { name: 'variableBorrowIndex', type: 'uint40', internalType: 'uint40' },
      { name: 'lastUpdateTimestamp', type: 'uint40', internalType: 'uint40' },
    ],
    stateMutability: 'view',
  },
] as const

export type AaveReserveData = {
  unbacked: bigint
  accruedToTreasuryScaled: bigint
  totalAToken: bigint
  totalStableDebt: bigint
  totalVariableDebt: bigint
  liquidityRate: bigint
  variableBorrowRate: bigint
  stableBorrowRate: bigint
  averageStableBorrowRate: number
  liquidityIndex: number
  variableBorrowIndex: number
  lastUpdateTimestamp: number
}

export class AaveDataProvider {
  constructor(
    private readonly client: EVMClient,
    public readonly address: Address,
  ) {}

  getReserveData(runtime: Runtime<unknown>, asset: Address): AaveReserveData {
    const callData = encodeFunctionData({
      abi: AaveDataProviderABI,
      functionName: 'getReserveData',
      args: [asset],
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result()

    const decoded = decodeFunctionResult({
      abi: AaveDataProviderABI,
      functionName: 'getReserveData',
      data: bytesToHex(result.data),
    }) as readonly [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      number,
      number,
      number,
      number,
    ]

    return {
      unbacked: decoded[0],
      accruedToTreasuryScaled: decoded[1],
      totalAToken: decoded[2],
      totalStableDebt: decoded[3],
      totalVariableDebt: decoded[4],
      liquidityRate: decoded[5],
      variableBorrowRate: decoded[6],
      stableBorrowRate: decoded[7],
      averageStableBorrowRate: decoded[8],
      liquidityIndex: decoded[9],
      variableBorrowIndex: decoded[10],
      lastUpdateTimestamp: decoded[11],
    }
  }
}
