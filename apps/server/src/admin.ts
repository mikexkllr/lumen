/** Moderation access: `Authorization: Bearer <LUMEN_ADMIN_TOKEN>` (at least 16 characters), compared in constant time. */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

export function adminOk(req: FastifyRequest, token: string | null | undefined): boolean {
  if (!token || token.length < 16) return false;
  const h = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
  const a = Buffer.from(h);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
