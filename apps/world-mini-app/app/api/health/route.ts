import { NextResponse } from 'next/server'
import { getServerRuntimeConfig } from '@/src/lib/server/runtime-config'

export async function GET() {
  const runtime = getServerRuntimeConfig()
  return NextResponse.json({
    status: 'ok',
    service: 'omni-yield-api',
    executionMode: runtime.mode,
    homeChain: runtime.home.chain.name,
  })
}
