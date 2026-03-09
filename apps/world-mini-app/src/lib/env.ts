import type { ExecutionMode } from './types'

type WorldIdEnvironment = 'production' | 'staging'
type TestnetHomeChainMode = 'world' | 'eth'

const executionMode: ExecutionMode =
  process.env.NEXT_PUBLIC_EXECUTION_MODE === 'mainnet_live' ? 'mainnet_live' : 'testnet_hybrid'
const testnetHomeChainMode: TestnetHomeChainMode =
  process.env.NEXT_PUBLIC_TESTNET_HOME_CHAIN_MODE === 'eth' ? 'eth' : 'world'

const testnetHomeUsdcAddress =
  process.env.NEXT_PUBLIC_TESTNET_HOME_USDC_ADDRESS ?? process.env.NEXT_PUBLIC_HOME_USDC_ADDRESS ?? ''
const testnetHomeVaultAddress =
  process.env.NEXT_PUBLIC_TESTNET_HOME_VAULT_ADDRESS ??
  process.env.NEXT_PUBLIC_HOME_VAULT_ADDRESS ??
  ''
const testnetRpcUrl =
  testnetHomeChainMode === 'eth'
    ? process.env.NEXT_PUBLIC_TESTNET_HOME_RPC_URL ??
      process.env.NEXT_PUBLIC_TESTNET_WORLD_RPC_URL ??
      process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL ??
      process.env.NEXT_PUBLIC_WORLD_SEPOLIA_RPC_URL ??
      'https://ethereum-sepolia-rpc.publicnode.com'
    : process.env.NEXT_PUBLIC_TESTNET_HOME_RPC_URL ??
      process.env.NEXT_PUBLIC_TESTNET_WORLD_RPC_URL ??
      process.env.NEXT_PUBLIC_WORLD_SEPOLIA_RPC_URL ??
      process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL ??
      'https://worldchain-sepolia.g.alchemy.com/public'

const mainnetHomeUsdcAddress = process.env.NEXT_PUBLIC_MAINNET_HOME_USDC_ADDRESS ?? ''
const mainnetHomeVaultAddress = process.env.NEXT_PUBLIC_MAINNET_HOME_VAULT_ADDRESS ?? ''
const mainnetRpcUrl =
  process.env.NEXT_PUBLIC_MAINNET_WORLD_RPC_URL ?? 'https://worldchain-mainnet.g.alchemy.com/public'

export const env: {
  executionMode: ExecutionMode
  isTestnetHybridMode: boolean
  isMainnetLiveMode: boolean
  testnetHomeChainMode: TestnetHomeChainMode
  appName: string
  worldAppId: string
  worldRpId: string
  worldIdEnvironment: WorldIdEnvironment
  worldClientId: string
  worldIdAction: string
  worldIdDevBypass: boolean
  devWalletAddress: string
  walletConnectProjectId: string
  homeVaultAddress: string
  homeUsdcAddress: string
  rpcUrl: string
} = {
  executionMode,
  isTestnetHybridMode: executionMode === 'testnet_hybrid',
  isMainnetLiveMode: executionMode === 'mainnet_live',
  testnetHomeChainMode,
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Omni-Yield',
  worldAppId: process.env.NEXT_PUBLIC_WORLD_APP_ID ?? '',
  worldRpId: process.env.NEXT_PUBLIC_WORLD_RP_ID ?? '',
  worldIdEnvironment:
    process.env.NEXT_PUBLIC_WORLD_ID_ENVIRONMENT === 'staging' ? 'staging' : 'production',
  worldClientId: process.env.NEXT_PUBLIC_WORLD_CLIENT_ID ?? '',
  worldIdAction: process.env.NEXT_PUBLIC_WORLD_ID_ACTION ?? 'omni-yield-access',
  worldIdDevBypass: process.env.NEXT_PUBLIC_WORLD_ID_DEV_BYPASS === 'true',
  devWalletAddress:
    process.env.NEXT_PUBLIC_DEV_WALLET_ADDRESS ?? '0x000000000000000000000000000000000000dEaD',
  walletConnectProjectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? '',
  homeVaultAddress: executionMode === 'mainnet_live' ? mainnetHomeVaultAddress : testnetHomeVaultAddress,
  homeUsdcAddress: executionMode === 'mainnet_live' ? mainnetHomeUsdcAddress : testnetHomeUsdcAddress,
  rpcUrl: executionMode === 'mainnet_live' ? mainnetRpcUrl : testnetRpcUrl,
}
