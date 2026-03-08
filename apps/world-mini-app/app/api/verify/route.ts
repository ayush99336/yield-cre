import type { ISuccessResult } from '@worldcoin/idkit-core'
import { NextResponse } from 'next/server'
import { keccak256, toBytes } from 'viem'
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

function hashToFieldDigest(signal: string): `0x${string}` {
  const hashHex = keccak256(toBytes(signal))
  const shifted = BigInt(hashHex) >> 8n
  return `0x${shifted.toString(16).padStart(64, '0')}` as const
}

type VerifyResult = { success: true } | { success: false; code?: string; detail?: string }

async function verifyViaV4({
  appId,
  action,
  signal,
  proof,
}: {
  appId: `app_${string}`
  action: string
  signal: string
  proof: ISuccessResult
}): Promise<VerifyResult> {
  const signalHash = hashToFieldDigest(signal)
  const body = {
    protocol_version: '3.0',
    nonce: '0x0000000000000000000000000000000000000000000000000000000000000000',
    action,
    environment: 'production',
    responses: [
      {
        identifier: proof.verification_level,
        signal_hash: signalHash,
        proof: proof.proof,
        merkle_root: proof.merkle_root,
        nullifier: proof.nullifier_hash,
      },
    ],
  }

  const response = await fetch(`https://developer.worldcoin.org/api/v4/verify/${appId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; code?: string; detail?: string }
    | null

  if (response.ok && payload?.success === true) {
    return { success: true }
  }

  return {
    success: false,
    code: payload?.code ?? `http_${response.status}`,
    detail: payload?.detail ?? 'World verify v4 failed',
  }
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

    console.log('verify_request', {
      action,
      signal: parsed.data.signal,
      appId,
      appIdConfigured: Boolean(appId),
      devBypass,
    })

    if (parsed.data.proof && typeof parsed.data.proof === 'object') {
      const proofObj = parsed.data.proof as Record<string, unknown>
      const verifications = Array.isArray(proofObj.verifications)
        ? (proofObj.verifications as Array<Record<string, unknown>>)
        : undefined
      console.log('verify_payload_shape', {
        proofKeys: Object.keys(proofObj),
        hasProtocolVersion: typeof proofObj.protocol_version === 'string',
        hasResponsesArray: Array.isArray(proofObj.responses),
        hasVerificationsArray: Array.isArray(proofObj.verifications),
        firstVerificationKeys: verifications?.[0] ? Object.keys(verifications[0]) : [],
      })
    }

    if (!appId && !devBypass) {
      return NextResponse.json({ error: 'WORLD_APP_ID is not configured' }, { status: 500 })
    }

    let verificationResult: VerifyResult
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
      verificationResult = await verifyViaV4({
        appId: appId as `app_${string}`,
        action,
        signal: parsed.data.signal,
        proof,
      })
      nullifierHash = proof.nullifier_hash
      verificationLevel = proof.verification_level
    }

    if (!verificationResult.success) {
      console.log('verify_failed', {
        appId,
        action,
        code: verificationResult.code,
        detail: verificationResult.detail,
      })
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
