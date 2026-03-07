export const env = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Omni-Yield',
  worldAppId: process.env.NEXT_PUBLIC_WORLD_APP_ID ?? '',
  worldClientId: process.env.NEXT_PUBLIC_WORLD_CLIENT_ID ?? '',
  walletConnectProjectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? '',
  rpcUrl:
    process.env.NEXT_PUBLIC_WORLD_SEPOLIA_RPC_URL ??
    'https://worldchain-sepolia.g.alchemy.com/public',
}
