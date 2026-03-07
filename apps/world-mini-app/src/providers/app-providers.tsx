'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MiniKit } from '@worldcoin/minikit-js'
import { useMemo } from 'react'
import { WagmiProvider, createConfig, http } from 'wagmi'

import { worldSepolia } from '@/src/lib/chains'
import { env } from '@/src/lib/env'

export function AppProviders({ children }: { children: React.ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), [])

  const wagmiConfig = useMemo(
    () =>
      createConfig({
        chains: [worldSepolia],
        transports: {
          [worldSepolia.id]: http(env.rpcUrl),
        },
      }),
    [],
  )

  // MiniKit bootstraps command bridge inside World App WebView.
  if (typeof window !== 'undefined') {
    MiniKit.install(env.worldAppId)
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
