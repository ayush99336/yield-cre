'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MiniKit } from '@worldcoin/minikit-js'
import { useEffect, useMemo } from 'react'
import { WagmiProvider, createConfig, http } from 'wagmi'

import { ethereumSepolia, worldMainnet, worldSepolia } from '@/src/lib/chains'
import { env } from '@/src/lib/env'

export function AppProviders({ children }: { children: React.ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), [])

  const wagmiConfig = useMemo(
    () => {
      const activeChain = env.isMainnetLiveMode
        ? worldMainnet
        : env.testnetHomeChainMode === 'eth'
          ? ethereumSepolia
          : worldSepolia
      return createConfig({
        chains: [activeChain],
        transports: {
          [activeChain.id]: http(env.rpcUrl),
        },
      })
    },
    [],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!env.worldAppId) {
      console.warn('NEXT_PUBLIC_WORLD_APP_ID is not set. MiniKit commands may be unavailable.')
      return
    }

    const installResult = MiniKit.install(env.worldAppId)
    if (!installResult.success) {
      console.warn('MiniKit.install failed:', installResult.errorCode, installResult.errorMessage)
    }
  }, [])

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
