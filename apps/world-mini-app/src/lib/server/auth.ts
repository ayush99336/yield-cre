import { prisma } from './db'

export async function requireAdminKey(request: Request): Promise<boolean> {
  const configured = process.env.ADMIN_API_KEY
  if (!configured) {
    return false
  }

  const provided = request.headers.get('x-admin-key')
  return provided === configured
}

export async function loadSession(request: Request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '').trim()
  if (!token) return null

  const session = await prisma.userSession.findUnique({ where: { sessionToken: token } })
  if (!session) return null
  if (session.expiresAt.getTime() < Date.now()) return null
  return session
}
