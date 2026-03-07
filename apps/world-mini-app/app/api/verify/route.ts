import type { ISuccessResult } from '@worldcoin/idkit-core'
import { verifyCloudProof } from '@worldcoin/idkit-core/backend'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { prisma } from '@/src/lib/server/db'

const verifyBodySchema = z.object({
  proof: z.custom<ISuccessResult>(),
  signal: z.string().min(1),
  action: z.string().min(1).default('omni-yield-access'),
})

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = verifyBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  const appId = process.env.WORLD_APP_ID as `app_${string}` | undefined
  const devBypass = process.env.WORLD_ID_DEV_BYPASS === 'true'

  if (!appId && !devBypass) {
    return NextResponse.json({ error: 'WORLD_APP_ID is not configured' }, { status: 500 })
  }

  let verificationResult: { success: boolean; code?: string; detail?: string }
  if (devBypass) {
    verificationResult = { success: true }
  } else {
    verificationResult = await verifyCloudProof(
      parsed.data.proof,
      appId as `app_${string}`,
      parsed.data.action,
      parsed.data.signal,
    )
  }

  if (!verificationResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: verificationResult.code ?? 'verification_failed',
        detail: verificationResult.detail,
      },
      { status: 401 },
    )
  }

  const nullifierHash = parsed.data.proof.nullifier_hash
  const existing = await prisma.worldIdProof.findUnique({ where: { nullifierHash } })
  if (existing) {
    return NextResponse.json(
      {
        success: false,
        error: 'nullifier_reused',
      },
      { status: 409 },
    )
  }

  const saved = await prisma.worldIdProof.create({
    data: {
      nullifierHash,
      signal: parsed.data.signal,
      verificationLevel: parsed.data.proof.verification_level,
    },
  })

  return NextResponse.json({ success: true, proofId: saved.id })
}
