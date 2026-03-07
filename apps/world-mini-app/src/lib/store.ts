'use client'

import { create } from 'zustand'

type PositionResponse = {
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
}

type AppState = {
  isVerified: boolean
  walletAddress: string
  sessionToken: string
  proofId: string
  position: PositionResponse | null
  txStatus: string
  setVerified: (v: boolean) => void
  setWalletAddress: (address: string) => void
  setSession: (token: string, proofId?: string) => void
  setPosition: (position: PositionResponse | null) => void
  setTxStatus: (status: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  isVerified: false,
  walletAddress: '',
  sessionToken: '',
  proofId: '',
  position: null,
  txStatus: 'idle',
  setVerified: (v) => set({ isVerified: v }),
  setWalletAddress: (walletAddress) => set({ walletAddress }),
  setSession: (sessionToken, proofId = '') => set({ sessionToken, proofId }),
  setPosition: (position) => set({ position }),
  setTxStatus: (txStatus) => set({ txStatus }),
}))
