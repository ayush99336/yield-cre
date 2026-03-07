import { decodeFunctionResult, encodeFunctionData, zeroAddress } from 'viem'
import type { Address } from 'viem'
import {
  bytesToHex,
  encodeCallMsg,
  EVMClient,
  LAST_FINALIZED_BLOCK_NUMBER,
  prepareReportRequest,
  type Runtime,
} from '@chainlink/cre-sdk'

export const YieldVaultABI = [
  {
    type: 'function',
    name: 'currentYieldChain',
    inputs: [],
    outputs: [{ name: '', type: 'string', internalType: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'initiateRebalance',
    inputs: [{ name: 'newChain', type: 'string', internalType: 'string' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

export class YieldVault {
  constructor(
    private readonly client: EVMClient,
    public readonly address: Address,
  ) {}

  currentYieldChain(runtime: Runtime<unknown>): string {
    const callData = encodeFunctionData({
      abi: YieldVaultABI,
      functionName: 'currentYieldChain',
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result()

    return decodeFunctionResult({
      abi: YieldVaultABI,
      functionName: 'currentYieldChain',
      data: bytesToHex(result.data),
    }) as string
  }

  writeReportFromInitiateRebalance(
    runtime: Runtime<unknown>,
    newChain: string,
    gasConfig?: { gasLimit?: string },
  ) {
    const callData = encodeFunctionData({
      abi: YieldVaultABI,
      functionName: 'initiateRebalance',
      args: [newChain],
    })

    const reportResponse = runtime.report(prepareReportRequest(callData)).result()

    return this.client
      .writeReport(runtime, {
        receiver: this.address,
        report: reportResponse,
        gasConfig,
      })
      .result()
  }
}
