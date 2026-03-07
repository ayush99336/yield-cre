import { type CronPayload, cre, type Runtime } from '@chainlink/cre-sdk'
import { z } from 'zod'

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

export const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
  if (!payload.scheduledExecutionTime) {
    throw new Error('Scheduled execution time is required')
  }

  const enabledChains = runtime.config.chains.filter((c) => c.enabled)
  if (enabledChains.length < 2) {
    throw new Error('At least two enabled chains are required')
  }

  runtime.log('Running Omni-Yield CronTrigger for APR monitoring and rebalance checks')
  runtime.log(`homeChainName=${runtime.config.homeChainName}, thresholdBps=${runtime.config.rebalanceThresholdBps}, cooldownSeconds=${runtime.config.cooldownSeconds}`)
  runtime.log(`enabledChains=${enabledChains.map((c) => c.id).join(',')}`)

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
