import type { ISuccessResult } from '@worldcoin/idkit-core'
import { verifyCloudProof } from '@worldcoin/idkit-core/backend'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { prisma } from '@/src/lib/server/db'

const verifyBodySchema = z.object({
  proof: z.unknown().optional(),
  signal: z.string().min(1),
  action: z.string().min(1).optional(),
})

function normalizeProofPayload(input: unknown): ISuccessResult | null {
  if (!input || typeof input !== 'object') return null

  const maybeSingle = input as Partial<ISuccessResult>
  if (
    typeof maybeSingle.nullifier_hash === 'string' &&
    typeof maybeSingle.proof === 'string' &&
    typeof maybeSingle.merkle_root === 'string' &&
    typeof maybeSingle.verification_level === 'string'
  ) {
    return maybeSingle as ISuccessResult
  }

  const maybeMulti = input as { verifications?: unknown[] }
  if (Array.isArray(maybeMulti.verifications)) {
    for (const item of maybeMulti.verifications) {
      const normalized = normalizeProofPayload(item)
      if (normalized) return normalized
    }
  }

  return null
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = verifyBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
    }

    const appId = (process.env.WORLD_APP_ID ??
      process.env.NEXT_PUBLIC_WORLD_APP_ID) as `app_${string}` | undefined
    const devBypass = process.env.WORLD_ID_DEV_BYPASS === 'true'
    const action =
      parsed.data.action ??
      process.env.WORLD_ID_ACTION ??
      process.env.NEXT_PUBLIC_WORLD_ID_ACTION ??
      'omni-yield-access'

    if (!appId && !devBypass) {
      return NextResponse.json({ error: 'WORLD_APP_ID is not configured' }, { status: 500 })
    }

    let verificationResult: { success: boolean; code?: string; detail?: string }
    let nullifierHash = ''
    let verificationLevel = 'device'

    if (devBypass) {
      verificationResult = { success: true }
      const devProof = (parsed.data.proof ?? {}) as {
        nullifier_hash?: string
        verification_level?: string
      }
      nullifierHash = devProof.nullifier_hash ?? `dev-${crypto.randomUUID()}`
      verificationLevel = devProof.verification_level ?? 'device'
    } else {
      if (!parsed.data.proof) {
        return NextResponse.json({ error: 'proof is required' }, { status: 400 })
      }
      const proof = normalizeProofPayload(parsed.data.proof)
      if (!proof) {
        return NextResponse.json({ error: 'invalid proof payload shape' }, { status: 400 })
      }
      verificationResult = await verifyCloudProof(
        proof,
        appId as `app_${string}`,
        action,
        parsed.data.signal,
      )
      nullifierHash = proof.nullifier_hash
      verificationLevel = proof.verification_level
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

    const existing = await prisma.worldIdProof.findUnique({ where: { nullifierHash } })
    if (existing) {
      return NextResponse.json(
        {
          success: true,
          proofId: existing.id,
          reused: true,
        },
      )
    }

    const saved = await prisma.worldIdProof.create({
      data: {
        nullifierHash,
        signal: parsed.data.signal,
        verificationLevel,
      },
    })

    return NextResponse.json({ success: true, proofId: saved.id, reused: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unexpected verify route error'
    console.error('POST /api/verify failed:', error)
    return NextResponse.json({ error: 'verify_route_failed', detail: message }, { status: 500 })
  }
}
