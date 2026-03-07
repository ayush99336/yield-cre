import { describe, expect, test } from 'bun:test'
import { newTestRuntime } from '@chainlink/cre-sdk/test'

import { computeRebalanceDecision, onCronTrigger } from './workflow'

describe('computeRebalanceDecision', () => {
  test('skips when best chain is already current', () => {
    const decision = computeRebalanceDecision({
      snapshots: [
        { id: 'polygonAmoy', chainName: 'polygon-testnet-amoy', aprRay: 60n, aprBps: 60n, lastUpdateTimestamp: 100 },
        { id: 'arbitrumSepolia', chainName: 'ethereum-testnet-sepolia-arbitrum-1', aprRay: 50n, aprBps: 50n, lastUpdateTimestamp: 100 },
      ],
      currentYieldChain: 'polygonAmoy',
      thresholdBps: 50,
      cooldownSeconds: 600,
      nowSeconds: 10_000,
    })

    expect(decision.kind).toBe('skip')
    if (decision.kind === 'skip') {
      expect(decision.reason).toBe('already-best-chain')
    }
  })

  test('skips when APR gap is below threshold', () => {
    const decision = computeRebalanceDecision({
      snapshots: [
        { id: 'polygonAmoy', chainName: 'polygon-testnet-amoy', aprRay: 110n, aprBps: 110n, lastUpdateTimestamp: 1 },
        { id: 'arbitrumSepolia', chainName: 'ethereum-testnet-sepolia-arbitrum-1', aprRay: 100n, aprBps: 100n, lastUpdateTimestamp: 1 },
      ],
      currentYieldChain: 'arbitrumSepolia',
      thresholdBps: 20,
      cooldownSeconds: 60,
      nowSeconds: 10_000,
    })

    expect(decision.kind).toBe('skip')
    if (decision.kind === 'skip') {
      expect(decision.reason).toBe('below-threshold')
    }
  })

  test('skips when cooldown is active', () => {
    const decision = computeRebalanceDecision({
      snapshots: [
        { id: 'polygonAmoy', chainName: 'polygon-testnet-amoy', aprRay: 200n, aprBps: 200n, lastUpdateTimestamp: 9_900 },
        { id: 'arbitrumSepolia', chainName: 'ethereum-testnet-sepolia-arbitrum-1', aprRay: 100n, aprBps: 100n, lastUpdateTimestamp: 9_900 },
      ],
      currentYieldChain: 'arbitrumSepolia',
      thresholdBps: 50,
      cooldownSeconds: 500,
      nowSeconds: 10_000,
    })

    expect(decision.kind).toBe('skip')
    if (decision.kind === 'skip') {
      expect(decision.reason).toBe('cooldown-active')
    }
  })

  test('returns rebalance decision when all checks pass', () => {
    const decision = computeRebalanceDecision({
      snapshots: [
        { id: 'polygonAmoy', chainName: 'polygon-testnet-amoy', aprRay: 300n, aprBps: 300n, lastUpdateTimestamp: 1 },
        { id: 'arbitrumSepolia', chainName: 'ethereum-testnet-sepolia-arbitrum-1', aprRay: 100n, aprBps: 100n, lastUpdateTimestamp: 1 },
      ],
      currentYieldChain: 'arbitrumSepolia',
      thresholdBps: 50,
      cooldownSeconds: 60,
      nowSeconds: 10_000,
    })

    expect(decision.kind).toBe('rebalance')
    if (decision.kind === 'rebalance') {
      expect(decision.targetChain).toBe('polygonAmoy')
      expect(decision.diffBps).toBe(200n)
    }
  })

  test('skips when current chain is not in snapshots', () => {
    const decision = computeRebalanceDecision({
      snapshots: [
        { id: 'polygonAmoy', chainName: 'polygon-testnet-amoy', aprRay: 150n, aprBps: 150n, lastUpdateTimestamp: 1 },
        { id: 'arbitrumSepolia', chainName: 'ethereum-testnet-sepolia-arbitrum-1', aprRay: 120n, aprBps: 120n, lastUpdateTimestamp: 1 },
      ],
      currentYieldChain: 'unknownChain',
      thresholdBps: 20,
      cooldownSeconds: 60,
      nowSeconds: 10_000,
    })

    expect(decision.kind).toBe('skip')
    if (decision.kind === 'skip') {
      expect(decision.reason).toBe('current-chain-not-enabled')
    }
  })
})

describe('onCronTrigger guards', () => {
  test('throws when scheduledExecutionTime is missing', () => {
    const runtime = newTestRuntime()
    ;(runtime as any).config = {
      schedule: '*/10 * * * *',
      rebalanceThresholdBps: 50,
      cooldownSeconds: 1800,
      homeChainName: 'ethereum-testnet-sepolia',
      homeVaultAddress: '0x1111111111111111111111111111111111111111',
      homeVaultWriteGasLimit: '500000',
      chains: [
        {
          id: 'polygonAmoy',
          chainName: 'polygon-testnet-amoy',
          usdc: '0x1',
          dataProvider: '0x2',
          pool: '0x3',
          receiver: '0x4',
          enabled: true,
        },
        {
          id: 'arbitrumSepolia',
          chainName: 'ethereum-testnet-sepolia-arbitrum-1',
          usdc: '0x11',
          dataProvider: '0x12',
          pool: '0x13',
          receiver: '0x14',
          enabled: true,
        },
      ],
    }

    expect(() => onCronTrigger(runtime as any, {} as any)).toThrow(
      'Scheduled execution time is required',
    )
  })

  test('throws when fewer than 2 chains are enabled', () => {
    const runtime = newTestRuntime()
    ;(runtime as any).config = {
      schedule: '*/10 * * * *',
      rebalanceThresholdBps: 50,
      cooldownSeconds: 1800,
      homeChainName: 'ethereum-testnet-sepolia',
      homeVaultAddress: '0x1111111111111111111111111111111111111111',
      homeVaultWriteGasLimit: '500000',
      chains: [
        {
          id: 'polygonAmoy',
          chainName: 'polygon-testnet-amoy',
          usdc: '0x1',
          dataProvider: '0x2',
          pool: '0x3',
          receiver: '0x4',
          enabled: true,
        },
        {
          id: 'arbitrumSepolia',
          chainName: 'ethereum-testnet-sepolia-arbitrum-1',
          usdc: '0x11',
          dataProvider: '0x12',
          pool: '0x13',
          receiver: '0x14',
          enabled: false,
        },
      ],
    }

    expect(() =>
      onCronTrigger(runtime as any, { scheduledExecutionTime: Date.now() } as any),
    ).toThrow('At least two enabled chains are required')
  })
})
