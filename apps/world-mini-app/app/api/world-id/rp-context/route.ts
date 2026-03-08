import { signRequest } from '@worldcoin/idkit-server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  action: z.string().min(1),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
    }

    const rpId = process.env.WORLD_RP_ID ?? process.env.NEXT_PUBLIC_WORLD_RP_ID
    const signingKey = process.env.WORLD_ID_SIGNER_PRIVATE_KEY ?? process.env.NEXT_WORLDCOIN_PVT
    const ttlSecondsRaw = process.env.WORLD_ID_REQUEST_TTL_SECONDS
    const ttlSeconds = ttlSecondsRaw ? Number(ttlSecondsRaw) : 300

    if (!rpId?.startsWith('rp_')) {
      return NextResponse.json({ error: 'WORLD_RP_ID is not configured' }, { status: 500 })
    }
    if (!signingKey?.startsWith('0x')) {
      return NextResponse.json({ error: 'WORLD_ID_SIGNER_PRIVATE_KEY is not configured' }, { status: 500 })
    }
    if (!process.env.WORLD_ID_SIGNER_PRIVATE_KEY && process.env.NEXT_WORLDCOIN_PVT) {
      console.warn('Using NEXT_WORLDCOIN_PVT fallback. Prefer WORLD_ID_SIGNER_PRIVATE_KEY.')
    }
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      return NextResponse.json(
        { error: 'WORLD_ID_REQUEST_TTL_SECONDS must be a positive number' },
        { status: 500 },
      )
    }

    const signature = signRequest(parsed.data.action, signingKey, ttlSeconds)

    return NextResponse.json({
      rp_context: {
        rp_id: rpId,
        nonce: signature.nonce,
        created_at: signature.createdAt,
        expires_at: signature.expiresAt,
        signature: signature.sig,
      },
    })
  } catch (error) {
    console.error('POST /api/world-id/rp-context failed:', error)
    const message = error instanceof Error ? error.message : 'unexpected rp-context error'
    return NextResponse.json({ error: 'rp_context_failed', detail: message }, { status: 500 })
  }
}
