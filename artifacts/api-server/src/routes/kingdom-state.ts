import { createHmac } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, kingdomStatesTable } from "@workspace/db";
import {
  GetKingdomStateResponse,
  SaveKingdomStateBody,
  SaveKingdomStateResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
type KingdomData = Record<string, unknown>;

function familyKeyFromRequest(rawCode: string | undefined): string | null {
  const familyCode = rawCode?.trim();
  if (!familyCode || familyCode.length < 4 || familyCode.length > 64) return null;

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required to protect family synchronization.");
  }

  return createHmac("sha256", secret).update(familyCode).digest("hex");
}

router.get("/kingdom-state", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const familyKey = familyKeyFromRequest(req.header("x-family-code"));
  if (!familyKey) {
    res.status(400).json({ error: "A valid family code is required." });
    return;
  }

  const [record] = await db
    .select()
    .from(kingdomStatesTable)
    .where(eq(kingdomStatesTable.familyKey, familyKey));

  if (!record) {
    res.status(404).json({ error: "No saved kingdom state was found." });
    return;
  }

  res.json(
    GetKingdomStateResponse.parse({
      state: record.state,
      activeChallenges: record.activeChallenges,
      version: record.version,
      updatedAt: record.updatedAt.toISOString(),
    }),
  );
});

router.put("/kingdom-state", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const familyKey = familyKeyFromRequest(req.header("x-family-code"));
  if (!familyKey) {
    res.status(400).json({ error: "A valid family code is required." });
    return;
  }

  const parsed = SaveKingdomStateBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid kingdom state payload");
    res.status(400).json({ error: "The saved challenge data is invalid." });
    return;
  }

  const data = parsed.data;
  if (data.completedProfileId) {
    const profileId = data.completedProfileId;
    const [existing] = await db
      .select()
      .from(kingdomStatesTable)
      .where(eq(kingdomStatesTable.familyKey, familyKey));

    if (existing) {
      const existingState = existing.state as KingdomData;
      const incomingState = data.state as KingdomData;
      const existingPoints = (existingState.points ?? {}) as KingdomData;
      const incomingPoints = (incomingState.points ?? {}) as KingdomData;
      const existingCompleted = (existingState.completed ?? {}) as KingdomData;
      const incomingCompleted = (incomingState.completed ?? {}) as KingdomData;
      const activeChallenges = { ...(existing.activeChallenges as KingdomData) };
      delete activeChallenges[profileId];

      const [completedRecord] = await db
        .update(kingdomStatesTable)
        .set({
          state: {
            ...existingState,
            points: { ...existingPoints, [profileId]: incomingPoints[profileId] },
            completed: { ...existingCompleted, [profileId]: incomingCompleted[profileId] },
          },
          activeChallenges,
          version: sql`${kingdomStatesTable.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(kingdomStatesTable.familyKey, familyKey))
        .returning();

      res.json(
        SaveKingdomStateResponse.parse({
          state: completedRecord.state,
          activeChallenges: completedRecord.activeChallenges,
          version: completedRecord.version,
          updatedAt: completedRecord.updatedAt.toISOString(),
        }),
      );
      return;
    }
  }

  const [record] = await db
    .insert(kingdomStatesTable)
    .values({
      familyKey,
      state: data.state,
      activeChallenges: data.activeChallenges,
      version: 1,
    })
    .onConflictDoUpdate({
      target: kingdomStatesTable.familyKey,
      set: {
        state: data.state,
        activeChallenges: data.activeChallenges,
        version: sql`${kingdomStatesTable.version} + 1`,
        updatedAt: new Date(),
      },
      where: data.version === null
        ? sql`false`
        : and(
          eq(kingdomStatesTable.familyKey, familyKey),
          eq(kingdomStatesTable.version, data.version),
        ),
    })
    .returning();

  if (!record) {
    res.status(409).json({ error: "A newer version was saved from another device." });
    return;
  }

  res.json(
    SaveKingdomStateResponse.parse({
      state: record.state,
      activeChallenges: record.activeChallenges,
      version: record.version,
      updatedAt: record.updatedAt.toISOString(),
    }),
  );
});

export default router;