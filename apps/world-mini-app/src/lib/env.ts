type WorldIdEnvironment = 'production' | 'staging'

export const env: {
  appName: string
  worldAppId: string
  worldRpId: string
  worldIdEnvironment: WorldIdEnvironment
  worldClientId: string
  worldIdAction: string
  worldIdDevBypass: boolean
  devWalletAddress: string
  walletConnectProjectId: string
  homeUsdcAddress: string
  rpcUrl: string
} = {
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
  homeUsdcAddress: process.env.NEXT_PUBLIC_HOME_USDC_ADDRESS ?? '',
  rpcUrl:
    process.env.NEXT_PUBLIC_WORLD_SEPOLIA_RPC_URL ??
    'https://worldchain-sepolia.g.alchemy.com/public',
}
