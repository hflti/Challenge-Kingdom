import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import {
  adminCredentialsTable,
  db,
  familiesTable,
  kingdomStatesTable,
  membersTable,
} from "@workspace/db";
import { signMemberToken } from "../lib/member-auth";

const router: IRouter = Router();
const ADMIN_CREDENTIAL_ID = "global";
const TOKEN_TTL_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

type Role = "owner" | "child";
type JsonMap = Record<string, unknown>;

function applicationSecret(): string {
  const secret = process.env.SESSION_SECRET ?? process.env.APP_SECRET ?? process.env.app_secret;
  if (!secret) throw new Error("SESSION_SECRET or APP_SECRET is required.");
  return secret;
}

function hashCode(code: string): string {
  return createHmac("sha256", applicationSecret()).update(code).digest("hex");
}

function sameHash(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function validCode(value: unknown): value is string {
  return typeof value === "string" && value.length >= 4 && value.length <= 64;
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" && value.length <= maxLength ? value.trim() : undefined;
}

function clientKey(req: Request): string {
  return req.ip || "unknown";
}

function loginLimited(req: Request): boolean {
  const attempt = loginAttempts.get(clientKey(req));
  if (!attempt) return false;
  if (attempt.resetAt <= Date.now()) {
    loginAttempts.delete(clientKey(req));
    return false;
  }
  return attempt.count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(req: Request): void {
  const key = clientKey(req);
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= Date.now()) {
    loginAttempts.set(key, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
    return;
  }
  current.count += 1;
}

function limited(req: Request, scope: string): boolean {
  const key = `${scope}:${clientKey(req)}`;
  const attempt = loginAttempts.get(key);
  if (!attempt) return false;
  if (attempt.resetAt <= Date.now()) {
    loginAttempts.delete(key);
    return false;
  }
  return attempt.count >= LOGIN_MAX_FAILURES;
}

function failed(req: Request, scope: string): void {
  const key = `${scope}:${clientKey(req)}`;
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= Date.now()) loginAttempts.set(key, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
  else current.count += 1;
}

function issueToken(version: number): { token: string; expiresAt: string } {
  const expiresAtMs = Date.now() + TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ v: version, exp: expiresAtMs })).toString("base64url");
  const signature = createHmac("sha256", applicationSecret()).update(payload).digest("base64url");
  return { token: `${payload}.${signature}`, expiresAt: new Date(expiresAtMs).toISOString() };
}

async function authorizeAdmin(req: Request): Promise<boolean> {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const [payload, signature, extra] = header.slice(7).split(".");
  if (!payload || !signature || extra) return false;
  const expected = createHmac("sha256", applicationSecret()).update(payload).digest("base64url");
  if (!sameHash(Buffer.from(signature).toString("hex"), Buffer.from(expected).toString("hex"))) return false;
  try {
    const token = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { v?: unknown; exp?: unknown };
    if (!Number.isInteger(token.v) || typeof token.exp !== "number" || token.exp <= Date.now()) return false;
    const [credential] = await db
      .select()
      .from(adminCredentialsTable)
      .where(eq(adminCredentialsTable.id, ADMIN_CREDENTIAL_ID));
    return Boolean(credential && credential.credentialVersion === token.v);
  } catch {
    return false;
  }
}

async function requireAdmin(req: Request): Promise<boolean> {
  const authorized = await authorizeAdmin(req);
  if (!authorized) {
    req.log.warn("Unauthorized admin account action");
  }
  return authorized;
}

function memberMetadata(member: typeof membersTable.$inferSelect): JsonMap {
  return {
    id: member.id,
    role: member.role,
    name: member.name,
    grade: member.grade,
    title: member.title,
    quote: member.quote,
    color: member.color,
  };
}

function omitMemberProgress(source: JsonMap, memberId: string): JsonMap {
  const copy = { ...source };
  delete copy[memberId];
  return copy;
}

router.get("/accounts", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const action = req.query.action;
  if (action === "admin-families") {
    if (!(await requireAdmin(req))) {
      res.status(401).json({ error: "Administrator authorization is required." });
      return;
    }
    const families = await db.select().from(familiesTable);
    const members = await db.select({ familyId: membersTable.familyId }).from(membersTable);
    const counts = new Map<string, number>();
    for (const member of members) counts.set(member.familyId, (counts.get(member.familyId) ?? 0) + 1);
    res.json({ families: families.map((family) => ({ id: family.id, name: family.name, memberCount: counts.get(family.id) ?? 0 })) });
    return;
  }

  if (action === "admin-members") {
    if (!(await requireAdmin(req))) {
      res.status(401).json({ error: "Administrator authorization is required." });
      return;
    }
    const familyId = req.query.familyId;
    if (!validText(familyId, 128)) {
      res.status(400).json({ error: "A valid family id is required." });
      return;
    }
    const [family] = await db.select().from(familiesTable).where(eq(familiesTable.id, familyId));
    if (!family) {
      res.status(404).json({ error: "Family not found." });
      return;
    }
    const members = await db.select().from(membersTable).where(eq(membersTable.familyId, family.id));
    res.json({ family: { id: family.id, name: family.name }, members: members.map(memberMetadata) });
    return;
  }

  if (action === "family-members") {
    if (limited(req, "family-members")) {
      res.status(429).json({ error: "Too many failed attempts. Please try again later." });
      return;
    }
    const code = req.header("x-family-code");
    if (!validCode(code)) {
      failed(req, "family-members");
      res.status(400).json({ error: "A valid family code is required." });
      return;
    }
    const [family] = await db.select().from(familiesTable).where(eq(familiesTable.familyKey, hashCode(code)));
    if (!family) {
      failed(req, "family-members");
      res.status(404).json({ error: "Family not found." });
      return;
    }
    const members = await db.select().from(membersTable).where(eq(membersTable.familyId, family.id));
    res.json({ family: { id: family.id, name: family.name }, members: members.map(memberMetadata) });
    return;
  }

  res.status(400).json({ error: "Unknown account action." });
});

router.post("/accounts", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const action = req.query.action;
  const body = req.body as Record<string, unknown>;

  if (action === "admin-reveal") {
    if (limited(req, "admin-reveal")) {
      res.status(429).json({ error: "Too many attempts. Please try again later." });
      return;
    }
    const revealCode = process.env.ADMIN_REVEAL_CODE;
    if (validCode(revealCode) && typeof body.code === "string" && sameHash(hashCode(body.code), hashCode(revealCode))) {
      res.json({ ok: true });
      return;
    }
    failed(req, "admin-reveal");
    res.status(401).json({ error: "Invalid administrator access code." });
    return;
  }

  if (action === "admin-login") {
    if (loginLimited(req)) {
      res.status(429).json({ error: "Too many failed attempts. Please try again later." });
      return;
    }
    if (!validCode(body.code)) {
      recordLoginFailure(req);
      res.status(400).json({ error: "A valid administrator code is required." });
      return;
    }
    let [credential] = await db.select().from(adminCredentialsTable).where(eq(adminCredentialsTable.id, ADMIN_CREDENTIAL_ID));
    if (!credential) {
      const initialCode = process.env.ADMIN_CODE;
      if (!validCode(initialCode)) {
        req.log.error("ADMIN_CODE is missing or invalid while initializing administrator credentials");
        res.status(503).json({ error: "Administrator login is not configured." });
        return;
      }
      const [created] = await db.insert(adminCredentialsTable).values({
        id: ADMIN_CREDENTIAL_ID,
        codeHash: hashCode(initialCode),
        credentialVersion: 1,
      }).onConflictDoNothing().returning();
      credential = created ?? (await db.select().from(adminCredentialsTable).where(eq(adminCredentialsTable.id, ADMIN_CREDENTIAL_ID)))[0];
    }
    if (!credential || !sameHash(hashCode(body.code), credential.codeHash)) {
      recordLoginFailure(req);
      res.status(401).json({ error: "Invalid administrator code." });
      return;
    }
    loginAttempts.delete(clientKey(req));
    res.json(issueToken(credential.credentialVersion));
    return;
  }

  if (action === "verify-member") {
    if (limited(req, "verify-member")) {
      res.status(429).json({ error: "Too many failed attempts. Please try again later." });
      return;
    }
    const familyCode = req.header("x-family-code");
    if (!validCode(familyCode) || !validText(body.memberId, 128) || !validCode(body.code) || (body.role !== undefined && body.role !== "owner" && body.role !== "child")) {
      failed(req, "verify-member");
      res.status(400).json({ error: "Invalid member verification request." });
      return;
    }
    const [family] = await db.select().from(familiesTable).where(eq(familiesTable.familyKey, hashCode(familyCode)));
    if (!family) {
      failed(req, "verify-member");
      res.status(404).json({ error: "Family not found." });
      return;
    }
    const [member] = await db.select().from(membersTable).where(and(eq(membersTable.id, body.memberId), eq(membersTable.familyId, family.id)));
    if (!member || (body.role !== undefined && member.role !== body.role) || !sameHash(hashCode(body.code), member.codeHash)) {
      failed(req, "verify-member");
      res.status(401).json({ error: "Invalid member credentials." });
      return;
    }
    res.json({ ok: true, role: member.role, ...signMemberToken(member) });
    return;
  }

  if (action === "bootstrap-family") {
    if (limited(req, "bootstrap-family")) {
      res.status(429).json({ error: "Too many failed attempts. Please try again later." });
      return;
    }
    const familyCode = req.header("x-family-code");
    if (!validCode(familyCode)) {
      failed(req, "bootstrap-family");
      res.status(400).json({ error: "A valid family code is required." });
      return;
    }
    const familyKey = hashCode(familyCode);
    await db.insert(familiesTable).values({ id: randomUUID(), name: "Family", familyKey })
      .onConflictDoNothing({ target: familiesTable.familyKey });
    const [family] = await db.select().from(familiesTable).where(eq(familiesTable.familyKey, familyKey));
    if (!family) {
      failed(req, "bootstrap-family");
      res.status(500).json({ error: "Unable to bootstrap family." });
      return;
    }
    res.status(201).json({ family: { id: family.id, name: family.name } });
    return;
  }

  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Administrator authorization is required." });
    return;
  }

  if (action === "admin-create-family") {
    if (!validText(body.name, 80) || !validCode(body.code)) {
      res.status(400).json({ error: "A valid kingdom name and code are required." });
      return;
    }
    const name = body.name.trim();
    const familyKey = hashCode(body.code);
    const created = await db.transaction(async (tx) => {
      const [collision] = await tx.select({ id: familiesTable.id }).from(familiesTable).where(eq(familiesTable.familyKey, familyKey));
      if (collision) return "collision" as const;
      const [stateCollision] = await tx.select({ familyKey: kingdomStatesTable.familyKey }).from(kingdomStatesTable).where(eq(kingdomStatesTable.familyKey, familyKey));
      if (stateCollision) return "collision" as const;
      const [family] = await tx.insert(familiesTable).values({ id: randomUUID(), name, familyKey }).returning();
      return family;
    });
    if (created === "collision") {
      res.status(409).json({ error: "That kingdom code is already in use." });
      return;
    }
    res.status(201).json({ family: { id: created.id, name: created.name } });
    return;
  }

  if (action === "admin-change-family-name") {
    if (!validText(body.familyId, 128) || !validText(body.name, 80)) {
      res.status(400).json({ error: "A valid family id and kingdom name are required." });
      return;
    }
    const [family] = await db.update(familiesTable)
      .set({ name: body.name.trim(), updatedAt: new Date() })
      .where(eq(familiesTable.id, body.familyId))
      .returning({ id: familiesTable.id });
    if (!family) {
      res.status(404).json({ error: "Family not found." });
      return;
    }
    res.json({ ok: true });
    return;
  }

  if (action === "admin-delete-family") {
    if (!validText(body.familyId, 128) || body.confirm !== true) {
      res.status(400).json({ error: "Deletion requires a family and confirmation." });
      return;
    }
    const familyId = body.familyId;
    const deleted = await db.transaction(async (tx) => {
      const [family] = await tx.select().from(familiesTable).where(eq(familiesTable.id, familyId));
      if (!family) return false;
      await tx.delete(kingdomStatesTable).where(eq(kingdomStatesTable.familyKey, family.familyKey));
      await tx.delete(familiesTable).where(eq(familiesTable.id, family.id));
      return true;
    });
    if (!deleted) {
      res.status(404).json({ error: "Family not found." });
      return;
    }
    res.json({ ok: true });
    return;
  }

  if (action === "admin-create-member") {
    const role = body.role;
    if (!validText(body.familyId, 128) || (role !== "owner" && role !== "child") || !validText(body.name, 120) || !validCode(body.code)) {
      res.status(400).json({ error: "Invalid member details." });
      return;
    }
    const optional = ["grade", "title", "quote", "color"].map((key) => optionalText(body[key], key === "quote" ? 500 : 120));
    if (optional.some((value, index) => body[["grade", "title", "quote", "color"][index]] !== undefined && value === undefined)) {
      res.status(400).json({ error: "Invalid optional member details." });
      return;
    }
    const familyId = body.familyId;
    const name = body.name;
    const code = body.code;
    const result = await db.transaction(async (tx) => {
      const [family] = await tx.select().from(familiesTable).where(eq(familiesTable.id, familyId));
      if (!family) return "family-missing" as const;
      if (role === "owner") {
        const [owner] = await tx.select({ id: membersTable.id }).from(membersTable).where(and(eq(membersTable.familyId, family.id), eq(membersTable.role, "owner")));
        if (owner) return "owner-exists" as const;
      }
      const [member] = await tx.insert(membersTable).values({
        id: randomUUID(),
        familyId: family.id,
        role,
        name: name.trim(),
        codeHash: hashCode(code),
        grade: optional[0],
        title: optional[1],
        quote: optional[2],
        color: optional[3],
      }).returning();
      return member;
    });
    if (result === "family-missing") {
      res.status(404).json({ error: "Family not found." });
      return;
    }
    if (result === "owner-exists") {
      res.status(409).json({ error: "Each family can have only one owner." });
      return;
    }
    res.status(201).json({ member: memberMetadata(result) });
    return;
  }

  if (action === "admin-change-member-code") {
    if (!validText(body.familyId, 128) || !validText(body.memberId, 128) || !validCode(body.newCode)) {
      res.status(400).json({ error: "Invalid code change request." });
      return;
    }
    const familyId = body.familyId;
    const memberId = body.memberId;
    const newCode = body.newCode;
    const [member] = await db.update(membersTable).set({ codeHash: hashCode(newCode), credentialVersion: sql`${membersTable.credentialVersion} + 1`, updatedAt: new Date() })
      .where(and(eq(membersTable.id, memberId), eq(membersTable.familyId, familyId))).returning();
    if (!member) {
      res.status(404).json({ error: "Member not found." });
      return;
    }
    res.json({ ok: true });
    return;
  }

  if (action === "admin-delete-member") {
    if (!validText(body.familyId, 128) || !validText(body.memberId, 128) || body.confirm !== true) {
      res.status(400).json({ error: "Deletion requires a family, member, and confirmation." });
      return;
    }
    const familyId = body.familyId;
    const memberId = body.memberId;
    const deleted = await db.transaction(async (tx) => {
      const [family] = await tx.select().from(familiesTable).where(eq(familiesTable.id, familyId));
      const [member] = family ? await tx.select().from(membersTable).where(and(eq(membersTable.id, memberId), eq(membersTable.familyId, family.id))) : [];
      if (!family || !member) return false;
      const [state] = await tx.select().from(kingdomStatesTable).where(eq(kingdomStatesTable.familyKey, family.familyKey));
      if (state) {
        const stateData = state.state as JsonMap;
        const [updatedState] = await tx.update(kingdomStatesTable).set({
          state: {
            ...stateData,
            points: omitMemberProgress((stateData.points ?? {}) as JsonMap, member.id),
            completed: omitMemberProgress((stateData.completed ?? {}) as JsonMap, member.id),
            customMissions: omitMemberProgress((stateData.customMissions ?? {}) as JsonMap, member.id),
          },
          activeChallenges: omitMemberProgress(state.activeChallenges as JsonMap, member.id),
          version: sql`${kingdomStatesTable.version} + 1`,
          updatedAt: new Date(),
        }).where(and(
          eq(kingdomStatesTable.familyKey, family.familyKey),
          eq(kingdomStatesTable.version, state.version),
        )).returning();
        if (!updatedState) return "conflict" as const;
      }
      await tx.delete(membersTable).where(eq(membersTable.id, member.id));
      return true;
    });
    if (deleted === "conflict") {
      res.status(409).json({ error: "The family state changed concurrently. Please retry deletion." });
      return;
    }
    if (!deleted) {
      res.status(404).json({ error: "Member not found." });
      return;
    }
    res.json({ ok: true });
    return;
  }

  if (action === "admin-change-family-code") {
    if (!validText(body.familyId, 128) || !validCode(body.newCode)) {
      res.status(400).json({ error: "Invalid family code change request." });
      return;
    }
    const familyId = body.familyId;
    const newCode = body.newCode;
    const changed = await db.transaction(async (tx) => {
      const [family] = await tx.select().from(familiesTable).where(eq(familiesTable.id, familyId));
      if (!family) return "missing" as const;
      const newKey = hashCode(newCode);
      const [collision] = await tx.select({ id: familiesTable.id }).from(familiesTable).where(eq(familiesTable.familyKey, newKey));
      if (collision && collision.id !== family.id) return "collision" as const;
      const [stateCollision] = await tx.select({ familyKey: kingdomStatesTable.familyKey }).from(kingdomStatesTable).where(eq(kingdomStatesTable.familyKey, newKey));
      if (stateCollision && stateCollision.familyKey !== family.familyKey) return "collision" as const;
      await tx.update(familiesTable).set({ familyKey: newKey, updatedAt: new Date() }).where(eq(familiesTable.id, family.id));
      await tx.update(kingdomStatesTable).set({ familyKey: newKey, updatedAt: new Date() }).where(eq(kingdomStatesTable.familyKey, family.familyKey));
      return "ok" as const;
    });
    if (changed === "missing") {
      res.status(404).json({ error: "Family not found." });
      return;
    }
    if (changed === "collision") {
      res.status(409).json({ error: "That family code is already in use." });
      return;
    }
    res.json({ ok: true });
    return;
  }

  if (action === "admin-change-code") {
    if (!validCode(body.currentCode) || !validCode(body.newCode)) {
      res.status(400).json({ error: "Administrator codes must be 4 to 64 characters." });
      return;
    }
    const currentCode = body.currentCode;
    const newCode = body.newCode;
    const rotated = await db.transaction(async (tx) => {
      const [credential] = await tx.select().from(adminCredentialsTable).where(eq(adminCredentialsTable.id, ADMIN_CREDENTIAL_ID));
      if (!credential || !sameHash(hashCode(currentCode), credential.codeHash)) return "invalid" as const;
      const [updated] = await tx.update(adminCredentialsTable).set({
        codeHash: hashCode(newCode),
        credentialVersion: sql`${adminCredentialsTable.credentialVersion} + 1`,
        updatedAt: new Date(),
      }).where(and(eq(adminCredentialsTable.id, ADMIN_CREDENTIAL_ID), eq(adminCredentialsTable.credentialVersion, credential.credentialVersion))).returning();
      return updated ? "ok" as const : "conflict" as const;
    });
    if (rotated === "invalid") {
      res.status(401).json({ error: "The current administrator code is incorrect." });
      return;
    }
    if (rotated === "conflict") {
      res.status(409).json({ error: "The administrator code was changed concurrently. Please retry." });
      return;
    }
    res.json({ ok: true });
    return;
  }

  res.status(400).json({ error: "Unknown account action." });
});

export default router;