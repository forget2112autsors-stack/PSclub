import bcrypt from 'bcryptjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';

const PIN_ROUNDS = 10;

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, PIN_ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

export interface TokenPayload {
  sub: string;
  name: string;
  role: Role;
  clubId: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const queryToken = (req.query as { token?: string })?.token;
    if (queryToken && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${queryToken}`;
    }
    await req.jwtVerify();
  } catch {
    await reply.code(401).send({ error: 'Kirish talab qilinadi.' });
  }
}

/** Administrator yoki egasi huquqi — TZ 3-bo'lim. */
export function requireManager(req: FastifyRequest, reply: FastifyReply): boolean {
  const role = req.user?.role;
  if (role !== 'ADMIN' && role !== 'OWNER') {
    void reply.code(403).send({ error: 'Bu amal uchun administrator huquqi kerak.' });
    return false;
  }
  return true;
}
