import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Request } from "express";
import { db, familiesTable, membersTable } from "@workspace/db";

const TOKEN_TTL_MS = 15 * 60 * 1000;

function secret(): string {
  const value = process.env.SESSION_SECRET ?? process.env.APP_SECRET ?? process.env.app_secret;
  if (!value) throw new Error("SESSION_SECRET or APP_SECRET is required.");
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signMemberToken(member: { id: string; familyId: string; role: string; credentialVersion: number }): { token: string; expiresAt: string } {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ kind: "member", f: member.familyId, m: member.id, r: member.role, v: member.credentialVersion, exp })).toString("base64url");
  return { token: `${payload}.${signature(payload)}`, expiresAt: new Date(exp).toISOString() };
}

export async function memberFromRequest(req: Request, familyKey: string): Promise<{ id: string; familyId: string; role: "owner" | "child" } | null> {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const [payload, supplied, extra] = header.slice(7).split(".");
  if (!payload || !supplied || extra) return null;
  const expected = signature(payload);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
  try {
    const token = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    if (token.kind !== "member" || typeof token.f !== "string" || typeof token.m !== "string" || (token.r !== "owner" && token.r !== "child") || !Number.isInteger(token.v) || typeof token.exp !== "number" || token.exp <= Date.now()) return null;
    const [member] = await db.select().from(membersTable).where(and(eq(membersTable.id, token.m), eq(membersTable.familyId, token.f)));
    const [family] = member ? await db.select().from(familiesTable).where(eq(familiesTable.id, member.familyId)) : [];
    if (!member || !family || family.familyKey !== familyKey || member.role !== token.r || member.credentialVersion !== token.v) return null;
    return { id: member.id, familyId: member.familyId, role: member.role as "owner" | "child" };
  } catch {
    return null;
  }
}