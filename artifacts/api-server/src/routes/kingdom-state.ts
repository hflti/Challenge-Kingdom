import { createHmac, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, familiesTable, kingdomStatesTable } from "@workspace/db";
import { memberFromRequest } from "../lib/member-auth";
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

async function ensureFamilyForState(familyKey: string): Promise<void> {
  await db
    .insert(familiesTable)
    .values({
      id: randomUUID(),
      // Legacy kingdom saves did not collect a family name. This neutral name
      // lets those families be administered without deriving data from a code.
      name: "Family",
      familyKey,
    })
    .onConflictDoNothing({ target: familiesTable.familyKey });
}

function withoutMember(map: KingdomData, memberId: string): KingdomData {
  const copy = { ...map };
  delete copy[memberId];
  return copy;
}

function emptyDefault(value: unknown): boolean {
  return value == null || (typeof value === "object" && !Array.isArray(value) && Object.keys(value as KingdomData).length === 0);
}

function childMayWrite(
  existing: typeof kingdomStatesTable.$inferSelect | undefined,
  state: KingdomData,
  activeChallenges: KingdomData,
  memberId: string,
): boolean {
  if (!existing) {
    for (const [key, value] of Object.entries(state)) {
      if (key === "points" || key === "completed" || key === "customMissions") {
        if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value as KingdomData).some((profileId) => profileId !== memberId)) return false;
      } else if (!emptyDefault(value)) return false;
    }
    return Object.keys(activeChallenges).every((profileId) => profileId === memberId);
  }
  const oldState = existing.state as KingdomData;
  const incomingRest = { ...state };
  const existingRest = { ...oldState };
  for (const key of ["points", "completed", "customMissions"]) {
    const incomingMap = (incomingRest[key] ?? {}) as KingdomData;
    const oldMap = (existingRest[key] ?? {}) as KingdomData;
    if (!isDeepStrictEqual(withoutMember(incomingMap, memberId), withoutMember(oldMap, memberId))) return false;
    delete incomingRest[key];
    delete existingRest[key];
  }
  return isDeepStrictEqual(incomingRest, existingRest)
    && isDeepStrictEqual(
      withoutMember(activeChallenges, memberId),
      withoutMember(existing.activeChallenges as KingdomData, memberId),
    );
}

router.get("/kingdom-state", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const familyKey = familyKeyFromRequest(req.header("x-family-code"));
  if (!familyKey) {
    res.status(400).json({ error: "A valid family code is required." });
    return;
  }
  const member = await memberFromRequest(req, familyKey);
  if (!member) {
    res.status(401).json({ error: "A valid member authorization token is required." });
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
  const member = await memberFromRequest(req, familyKey);
  if (!member) {
    res.status(401).json({ error: "A valid member authorization token is required." });
    return;
  }

  const parsed = SaveKingdomStateBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid kingdom state payload");
    res.status(400).json({ error: "The saved challenge data is invalid." });
    return;
  }

  const data = parsed.data;
  if (Boolean(data.completedProfileId) !== Boolean(data.completedChallengeId)) {
    res.status(400).json({ error: "Completion requires both profile and challenge identifiers." });
    return;
  }
  if (member.role === "child" && data.completedProfileId && data.completedProfileId !== member.id) {
    res.status(403).json({ error: "Children may only complete their own challenges." });
    return;
  }
  if (member.role === "child") {
    const [current] = await db.select().from(kingdomStatesTable).where(eq(kingdomStatesTable.familyKey, familyKey));
    if (!childMayWrite(current, data.state as KingdomData, data.activeChallenges as KingdomData, member.id)) {
      res.status(403).json({ error: "Children may only change their own progress and challenge." });
      return;
    }
  }

  if (data.completedProfileId && data.completedChallengeId) {
    if (
      data.completionBasePoints == null ||
      data.completionBaseCompleted == null ||
      data.completionPointsDelta == null ||
      data.completionCompletedDelta == null
    ) {
      res.status(400).json({ error: "Completion requires its starting progress and score changes." });
      return;
    }

    const profileId = data.completedProfileId;
    const [existing] = await db
      .select()
      .from(kingdomStatesTable)
      .where(eq(kingdomStatesTable.familyKey, familyKey));

    if (existing) {
      const existingActiveChallenges = existing.activeChallenges as KingdomData;
      const activeChallenge = existingActiveChallenges[profileId] as KingdomData | undefined;
      const existingState = existing.state as KingdomData;
      const existingPoints = (existingState.points ?? {}) as KingdomData;
      const existingCompleted = (existingState.completed ?? {}) as KingdomData;
      const activeChallengeMatches = activeChallenge?.challengeId === data.completedChallengeId;
      const unchangedBootstrapProgress =
        !activeChallenge &&
        existingPoints[profileId] === data.completionBasePoints &&
        existingCompleted[profileId] === data.completionBaseCompleted;
      if (existing.version !== data.version || (!activeChallengeMatches && !unchangedBootstrapProgress)) {
        res.status(409).json({ error: "The challenge changed on another device." });
        return;
      }

      const activeChallenges = { ...(existing.activeChallenges as KingdomData) };
      delete activeChallenges[profileId];

      const [completedRecord] = await db
        .update(kingdomStatesTable)
        .set({
          state: {
            ...existingState,
            points: {
              ...existingPoints,
              [profileId]: Math.min(120, Number(existingPoints[profileId] ?? 0) + data.completionPointsDelta),
            },
            completed: {
              ...existingCompleted,
              [profileId]: Math.min(120, Number(existingCompleted[profileId] ?? 0) + data.completionCompletedDelta),
            },
          },
          activeChallenges,
          version: sql`${kingdomStatesTable.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(kingdomStatesTable.familyKey, familyKey),
            eq(kingdomStatesTable.version, data.version),
          ),
        )
        .returning();

      if (!completedRecord) {
        res.status(409).json({ error: "The challenge changed on another device." });
        return;
      }

      await ensureFamilyForState(familyKey);
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

    const [createdRecord] = await db
      .insert(kingdomStatesTable)
      .values({
        familyKey,
        state: data.state,
        activeChallenges: data.activeChallenges,
        version: 1,
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: kingdomStatesTable.familyKey })
      .returning();

    if (createdRecord) {
      await ensureFamilyForState(familyKey);
      res.json(
        SaveKingdomStateResponse.parse({
          state: createdRecord.state,
          activeChallenges: createdRecord.activeChallenges,
          version: createdRecord.version,
          updatedAt: createdRecord.updatedAt.toISOString(),
        }),
      );
      return;
    }

    res.status(409).json({ error: "The family state changed during completion." });
    return;
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

  await ensureFamilyForState(familyKey);
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