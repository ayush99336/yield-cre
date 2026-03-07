import type { Metadata } from 'next'

import { AppProviders } from '@/src/providers/app-providers'

import './globals.css'

export const metadata: Metadata = {
  title: 'Omni-Yield',
  description: 'Cross-chain yield optimizer mini app for World',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
