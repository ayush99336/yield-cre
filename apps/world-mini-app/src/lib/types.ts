export type ExecutionMode = 'testnet_hybrid' | 'mainnet_live'

export type ChainStatusSnapshot = {
  id: string
  aprBps: number
  lastUpdate: number
  enabled: boolean
}

export type RebalanceDecisionView = {
  currentChain: string
  bestChain: string
  diffBps: number
  thresholdBps: number
  cooldownRemaining: number
  decision: 'rebalance' | 'skip'
  reason: string
}

export type PositionResponse = {
  walletAddress: string
  position: {
    totalAssets: string
    activeChain: string
    aprBps: number
    createdAt: string
  } | null
  recentRebalances: Array<{
    id: string
    targetChain: string
    status: string
    txHash: string | null
    createdAt: string
  }>
  chainStatusSnapshots?: ChainStatusSnapshot[]
  rebalanceDecision?: RebalanceDecisionView | null
  meta?: {
    warning?: string
    source?: 'onchain' | 'snapshot' | 'empty'
    executionMode?: ExecutionMode
  }
}
