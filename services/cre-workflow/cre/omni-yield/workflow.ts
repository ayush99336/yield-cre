import { type CronPayload, cre, getNetwork, type Runtime, TxStatus } from '@chainlink/cre-sdk'
import type { Address } from 'viem'
import { z } from 'zod'
import { AaveDataProvider } from '../contracts/evm/ts/generated/AaveDataProvider'
import { YieldVault } from '../contracts/evm/ts/generated/YieldVault'

export const configSchema = z.object({
  schedule: z.string(),
  rebalanceThresholdBps: z.number().min(0),
  cooldownSeconds: z.number().min(0),
  homeChainName: z.string(),
  homeVaultAddress: z.string(),
  homeVaultWriteGasLimit: z.string(),
  chains: z.array(
    z.object({
      id: z.string(),
      chainName: z.string(),
      usdc: z.string(),
      dataProvider: z.string(),
      pool: z.string(),
      receiver: z.string(),
      enabled: z.boolean(),
    }),
  ),
})

type Config = z.infer<typeof configSchema>

type ChainSnapshot = {
  id: string
  chainName: string
  aprRay: bigint
  aprBps: bigint
  lastUpdateTimestamp: number
}

const RAY_TO_BPS_DIVISOR = 100000000000000000000000n // 1e23

const aprRayToBps = (aprRay: bigint): bigint => aprRay / RAY_TO_BPS_DIVISOR

const scheduledTimeToSeconds = (scheduledExecutionTime: number): number => {
  // CRE runtime may surface milliseconds. Normalize into seconds.
  return scheduledExecutionTime > 1_000_000_000_000
    ? Math.floor(scheduledExecutionTime / 1000)
    : scheduledExecutionTime
}

const getEvmClient = (chainName: string) => {
  const network = getNetwork({
    chainFamily: 'evm',
    chainSelectorName: chainName,
    isTestnet: true,
  })
  if (!network) {
    throw new Error(`Network not found for chain selector name: ${chainName}`)
  }
  return new cre.capabilities.EVMClient(network.chainSelector.selector)
}

const readSnapshot = (runtime: Runtime<Config>, chain: Config['chains'][number]): ChainSnapshot => {
  try {
    const client = getEvmClient(chain.chainName)
    const dataProvider = new AaveDataProvider(client, chain.dataProvider as Address)
    const reserveData = dataProvider.getReserveData(runtime, chain.usdc as Address)

    const aprRay = reserveData.liquidityRate
    const aprBps = aprRayToBps(aprRay)
    runtime.log(
      `[${chain.id}] liquidityRate(RAY)=${aprRay} aprBps=${aprBps} lastUpdate=${reserveData.lastUpdateTimestamp}`,
    )

    return {
      id: chain.id,
      chainName: chain.chainName,
      aprRay,
      aprBps,
      lastUpdateTimestamp: reserveData.lastUpdateTimestamp,
    }
  } catch (err) {
    runtime.log(`[${chain.id}] APR read failed: ${String(err)}`)
    return {
      id: chain.id,
      chainName: chain.chainName,
      aprRay: 0n,
      aprBps: 0n,
      lastUpdateTimestamp: 0,
    }
  }
}

const findBestSnapshot = (snapshots: ChainSnapshot[]): ChainSnapshot => {
  if (snapshots.length === 0) {
    throw new Error('No chain snapshots found')
  }
  let best = snapshots[0]
  for (const snapshot of snapshots.slice(1)) {
    if (snapshot.aprRay > best.aprRay) {
      best = snapshot
    }
  }
  return best
}

export const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
  if (!payload.scheduledExecutionTime) {
    throw new Error('Scheduled execution time is required')
  }

  const enabledChains = runtime.config.chains.filter((c) => c.enabled)
  if (enabledChains.length < 2) {
    throw new Error('At least two enabled chains are required')
  }

  runtime.log('Running Omni-Yield CronTrigger for APR monitoring and rebalance checks')

  const snapshots = enabledChains.map((chain) => readSnapshot(runtime, chain))
  const best = findBestSnapshot(snapshots)
  runtime.log(`Best chain=${best.id} aprBps=${best.aprBps}`)

  const homeClient = getEvmClient(runtime.config.homeChainName)
  const vault = new YieldVault(homeClient, runtime.config.homeVaultAddress as Address)
  let currentYieldChain = ''
  try {
    currentYieldChain = vault.currentYieldChain(runtime)
  } catch (err) {
    runtime.log(`Vault read failed (currentYieldChain): ${String(err)}; skipping cycle.`)
    return ''
  }
  runtime.log(`Current vault chain=${currentYieldChain}`)

  if (currentYieldChain === best.id) {
    runtime.log('Best chain already active; no rebalance needed.')
    return ''
  }

  const current = snapshots.find((s) => s.id === currentYieldChain)
  if (!current) {
    runtime.log(`Current chain ${currentYieldChain} not in enabled chain list; skipping this cycle.`)
    return ''
  }

  const diffBps = best.aprBps - current.aprBps
  runtime.log(`APR diff bps=${diffBps}, threshold=${runtime.config.rebalanceThresholdBps}`)
  if (diffBps < BigInt(runtime.config.rebalanceThresholdBps)) {
    runtime.log('APR diff below threshold; skipping rebalance.')
    return ''
  }

  const nowSeconds = scheduledTimeToSeconds(payload.scheduledExecutionTime)
  const cooldownElapsed = nowSeconds - current.lastUpdateTimestamp
  runtime.log(`Cooldown elapsed=${cooldownElapsed}s, required=${runtime.config.cooldownSeconds}s`)
  if (cooldownElapsed < runtime.config.cooldownSeconds) {
    runtime.log('Cooldown still active; skipping rebalance.')
    return ''
  }

  const writeResp = vault.writeReportFromInitiateRebalance(
    runtime,
    best.id,
    { gasLimit: runtime.config.homeVaultWriteGasLimit },
  )
  if (writeResp.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`initiateRebalance failed: ${writeResp.errorMessage || writeResp.txStatus}`)
  }
  runtime.log(`Rebalance tx submitted successfully. targetChain=${best.id}`)

  return ''
}

export function initWorkflow(config: Config) {
  const cron = new cre.capabilities.CronCapability()
  return [
    cre.handler(
      cron.trigger({
        schedule: config.schedule,
      }),
      onCronTrigger,
    ),
  ]
}
