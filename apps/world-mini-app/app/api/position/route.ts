import { NextResponse } from 'next/server'

import { loadSession } from '@/src/lib/server/auth'
import { prisma } from '@/src/lib/server/db'

export async function GET(request: Request) {
  const session = await loadSession(request)
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const latestSnapshot = await prisma.positionSnapshot.findFirst({
    where: { walletAddress: session.walletAddress },
    orderBy: { createdAt: 'desc' },
  })

  const recentActions = await prisma.rebalanceAction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  return NextResponse.json({
    walletAddress: session.walletAddress,
    position: latestSnapshot,
    recentRebalances: recentActions,
  })
}
