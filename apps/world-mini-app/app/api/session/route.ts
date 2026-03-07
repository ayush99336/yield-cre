import { NextResponse } from 'next/server'
import { z } from 'zod'

import { prisma } from '@/src/lib/server/db'

const createSessionBody = z.object({
  walletAddress: z.string().min(1),
  proofId: z.string().optional(),
})

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = createSessionBody.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  const sessionToken = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  const session = await prisma.userSession.create({
    data: {
      walletAddress: parsed.data.walletAddress,
      proofId: parsed.data.proofId,
      sessionToken,
      expiresAt,
    },
  })

  return NextResponse.json({
    sessionToken: session.sessionToken,
    walletAddress: session.walletAddress,
    expiresAt: session.expiresAt,
  })
}
