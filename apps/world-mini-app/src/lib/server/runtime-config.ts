import fs from 'node:fs'
import path from 'node:path'

import type { Chain } from 'wagmi/chains'

import { ethereumSepolia, worldMainnet, worldSepolia } from '@/src/lib/chains'
import type { ExecutionMode } from '@/src/lib/types'

type RegistryDestination = {
  id: string
  chainName: string
  chainId?: number
  chainSelector?: string | number
  rpcUrl?: string
  usdc?: string
  dataProvider?: string
  pool?: string
  receiver?: string
  enabled?: boolean
}

type RegistryFile = {
  environment?: string
  home?: {
    chainName?: string
    chainSelector?: string | number
    rpcUrl?: string
    router?: string
    vault?: string
    usdc?: string
  }
  destinations?: Record<string, RegistryDestination>
}

export type DestinationRuntimeConfig = {
  id: string
  chainName: string
  chainId: number
  rpcUrl: string
  usdc: string
  dataProvider: string
  enabled: boolean
}

export type ServerRuntimeConfig = {
  mode: ExecutionMode
  home: {
    chain: Chain
    rpcUrl: string
    vaultAddress?: `0x${string}`
    usdcAddress?: `0x${string}`
  }
  destinationChains: DestinationRuntimeConfig[]
  rebalanceThresholdBps: number
  cooldownSeconds: number
  adminApiKey?: string
  adminRebalancePrivateKey?: `0x${string}`
}

const asAddress = (value?: string | null): `0x${string}` | undefined => {
  if (!value) return undefined
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return undefined
  return value as `0x${string}`
}

const asPrivateKey = (value?: string | null): `0x${string}` | undefined => {
  if (!value) return undefined
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) return undefined
  return value as `0x${string}`
}

const parseIntWithMin = (value: string | undefined, fallback: number, min: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min ? Math.floor(parsed) : fallback
}

const findRepoRoot = (): string => {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '..', '..'),
    path.resolve(process.cwd(), '..', '..', '..'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'deployments')) && fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate
    }
  }

  return process.cwd()
}

const resolvePath = (root: string, candidatePath: string): string =>
  path.isAbsolute(candidatePath) ? candidatePath : path.join(root, candidatePath)

const readRegistry = (filePath: string): RegistryFile | null => {
  try {
    if (!fs.existsSync(filePath)) return null
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as RegistryFile
    return parsed
  } catch {
    return null
  }
}

const modeFromEnv = (): ExecutionMode =>
  process.env.EXECUTION_MODE === 'mainnet_live' ? 'mainnet_live' : 'testnet_hybrid'

export const getServerRuntimeConfig = (): ServerRuntimeConfig => {
  const mode = modeFromEnv()
  const root = findRepoRoot()
  const envTestnetHomeChainMode =
    process.env.TESTNET_HOME_CHAIN_MODE ?? process.env.HOME_CHAIN_MODE
  const defaultTestnetRegistryPath = fs.existsSync(
    path.join(root, 'deployments', 'addresses.testnet.crosschain.json'),
  )
    ? path.join('deployments', 'addresses.testnet.crosschain.json')
    : path.join('deployments', 'addresses.testnet.json')

  const testnetRegistryPath = resolvePath(
    root,
    process.env.TESTNET_ADDRESS_REGISTRY_PATH ?? defaultTestnetRegistryPath,
  )
  const mainnetRegistryPath = resolvePath(
    root,
    process.env.MAINNET_ADDRESS_REGISTRY_PATH ?? path.join('deployments', 'addresses.mainnet.json'),
  )

  const registry = readRegistry(mode === 'mainnet_live' ? mainnetRegistryPath : testnetRegistryPath)
  const inferredTestnetHomeChainMode =
    registry?.home?.chainName?.includes('ethereum-sepolia') ||
    registry?.home?.chainName?.includes('ethereum-testnet-sepolia')
      ? 'eth'
      : registry?.home?.chainName?.includes('world')
        ? 'world'
        : undefined
  const testnetHomeChainMode = envTestnetHomeChainMode ?? inferredTestnetHomeChainMode ?? 'world'

  const testnetHomeVault = asAddress(
    process.env.TESTNET_HOME_VAULT_ADDRESS ?? process.env.HOME_VAULT_ADDRESS ?? registry?.home?.vault,
  )
  const testnetHomeUsdc = asAddress(
    process.env.TESTNET_HOME_USDC ?? process.env.HOME_USDC ?? registry?.home?.usdc,
  )
  const testnetRpcUrl =
    testnetHomeChainMode === 'eth'
      ? process.env.TESTNET_HOME_RPC_URL ??
        process.env.TESTNET_WORLD_RPC_URL ??
        process.env.NEXT_PUBLIC_TESTNET_HOME_RPC_URL ??
        process.env.NEXT_PUBLIC_TESTNET_WORLD_RPC_URL ??
        process.env.ETH_SEPOLIA_RPC_URL ??
        process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL ??
        process.env.NEXT_PUBLIC_WORLD_SEPOLIA_RPC_URL ??
        process.env.WORLD_SEPOLIA_RPC_URL ??
        registry?.home?.rpcUrl ??
        'https://ethereum-sepolia-rpc.publicnode.com'
      : process.env.TESTNET_HOME_RPC_URL ??
        process.env.TESTNET_WORLD_RPC_URL ??
        process.env.NEXT_PUBLIC_TESTNET_HOME_RPC_URL ??
        process.env.NEXT_PUBLIC_TESTNET_WORLD_RPC_URL ??
        process.env.NEXT_PUBLIC_WORLD_SEPOLIA_RPC_URL ??
        process.env.WORLD_SEPOLIA_RPC_URL ??
        process.env.ETH_SEPOLIA_RPC_URL ??
        process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL ??
        registry?.home?.rpcUrl ??
        'https://worldchain-sepolia.g.alchemy.com/public'

  const mainnetHomeVault = asAddress(process.env.MAINNET_HOME_VAULT_ADDRESS ?? registry?.home?.vault)
  const mainnetHomeUsdc = asAddress(process.env.MAINNET_HOME_USDC ?? registry?.home?.usdc)
  const mainnetRpcUrl =
    process.env.MAINNET_WORLD_RPC_URL ??
    process.env.NEXT_PUBLIC_MAINNET_WORLD_RPC_URL ??
    registry?.home?.rpcUrl ??
    'https://worldchain-mainnet.g.alchemy.com/public'

  const destinationFromRegistry = Object.values(registry?.destinations ?? {})
    .filter((destination) => destination.id && destination.chainName)
    .map((destination) => ({
      id: destination.id,
      chainName: destination.chainName,
      chainId:
        destination.chainId ??
        (destination.chainName.includes('arbitrum')
          ? 421614
          : destination.chainName.includes('optimism')
            ? 11155420
            : destination.chainName.includes('amoy')
              ? 80002
              : 0),
      rpcUrl: destination.rpcUrl ?? '',
      usdc: destination.usdc ?? '',
      dataProvider: destination.dataProvider ?? '',
      enabled: destination.enabled ?? true,
    }))

  const destinationFallback: DestinationRuntimeConfig[] = [
    {
      id: 'arbitrumSepolia',
      chainName: 'ethereum-testnet-sepolia-arbitrum-1',
      chainId: 421614,
      rpcUrl:
        process.env.TESTNET_ARBITRUM_SEPOLIA_RPC_URL ??
        process.env.ARBITRUM_SEPOLIA_RPC_URL ??
        'https://arbitrum-sepolia-rpc.publicnode.com',
      usdc: process.env.TESTNET_ARBITRUM_SEPOLIA_USDC ?? process.env.ARBITRUM_USDC ?? '',
      dataProvider: process.env.TESTNET_ARBITRUM_SEPOLIA_DATA_PROVIDER ?? '',
      enabled: process.env.TESTNET_ARBITRUM_SEPOLIA_ENABLED === 'false' ? false : true,
    },
    {
      id: 'optimismSepolia',
      chainName: 'ethereum-testnet-sepolia-optimism-1',
      chainId: 11155420,
      rpcUrl:
        process.env.TESTNET_OPTIMISM_SEPOLIA_RPC_URL ??
        process.env.OPTIMISM_SEPOLIA_RPC_URL ??
        'https://sepolia.optimism.io',
      usdc: process.env.TESTNET_OPTIMISM_SEPOLIA_USDC ?? process.env.OPTIMISM_USDC ?? '',
      dataProvider: process.env.TESTNET_OPTIMISM_SEPOLIA_DATA_PROVIDER ?? '',
      enabled: process.env.TESTNET_OPTIMISM_SEPOLIA_ENABLED === 'false' ? false : true,
    },
  ]

  const destinationChains =
    destinationFromRegistry.length > 0 ? destinationFromRegistry : destinationFallback

  const rebalanceThresholdBps = parseIntWithMin(
    process.env.REBALANCE_THRESHOLD_BPS ?? process.env.TESTNET_REBALANCE_THRESHOLD_BPS,
    50,
    0,
  )
  const cooldownSeconds = parseIntWithMin(
    process.env.COOLDOWN_SECONDS ?? process.env.TESTNET_COOLDOWN_SECONDS,
    1800,
    1,
  )

  const adminRebalancePrivateKey = asPrivateKey(
    mode === 'mainnet_live'
      ? process.env.MAINNET_ADMIN_REBALANCE_PRIVATE_KEY ?? process.env.ADMIN_REBALANCE_PRIVATE_KEY
      : process.env.TESTNET_ADMIN_REBALANCE_PRIVATE_KEY ?? process.env.ADMIN_REBALANCE_PRIVATE_KEY,
  )

  return {
    mode,
    home:
      mode === 'mainnet_live'
        ? {
            chain: worldMainnet,
            rpcUrl: mainnetRpcUrl,
            vaultAddress: mainnetHomeVault,
            usdcAddress: mainnetHomeUsdc,
          }
        : {
            chain: testnetHomeChainMode === 'eth' ? ethereumSepolia : worldSepolia,
            rpcUrl: testnetRpcUrl,
            vaultAddress: testnetHomeVault,
            usdcAddress: testnetHomeUsdc,
          },
    destinationChains,
    rebalanceThresholdBps,
    cooldownSeconds,
    adminApiKey: process.env.ADMIN_API_KEY,
    adminRebalancePrivateKey,
  }
}
