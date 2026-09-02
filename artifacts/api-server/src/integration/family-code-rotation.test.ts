import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, familiesTable, pool } from "@workspace/db";

type Json = Record<string, unknown>;
type ResponseBody = Json & { error?: string };

const adminRevealCode = process.env.ADMIN_REVEAL_CODE;
const oldFamilyCode = `old-${crypto.randomUUID().slice(0, 12)}`;
const newFamilyCode = `new-${crypto.randomUUID().slice(0, 12)}`;
const familyUsername = `rotation${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
const familyName = "اختبار تدوير رمز المملكة";

let server: Server;
let baseUrl: string;
let adminToken = "";
let familyId = "";
let childId = "";
let ownerId = "";
let oldChildToken = "";
let oldOwnerToken = "";

async function api(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT";
    body?: Json;
    token?: string;
    familyCode?: string;
    familyUsername?: string;
  } = {},
): Promise<{ status: number; body: ResponseBody }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.familyCode ? { "x-family-code": options.familyCode } : {}),
      ...(options.familyUsername ? { "x-family-username": options.familyUsername } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  let body: ResponseBody = {};
  try {
    body = await response.json() as ResponseBody;
  } catch {
    // The status is still useful when a proxy returns a non-JSON error.
  }
  return { status: response.status, body };
}

function accountAction(action: string): string {
  return `/api/accounts?action=${encodeURIComponent(action)}`;
}

async function expectStatus(
  path: string,
  status: number,
  options: Parameters<typeof api>[1] = {},
): Promise<ResponseBody> {
  const response = await api(path, options);
  assert.equal(response.status, status, `${path} returned ${response.status}: ${response.body.error ?? "no error"}`);
  return response.body;
}

function kingdomStateBody(points: number, missionTitle: string, version: number | null = null): Json {
  return {
    state: {
      points: { [childId]: points },
      completed: { [childId]: points > 0 ? 1 : 0 },
      customMissions: {
        [childId]: [{ id: "rotation-mission", title: missionTitle, rewardPoints: 5 }],
      },
      childRewards: {
        [childId]: {
          lifetimePoints: points,
          redeemed: points > 0 ? ["rotation-store-item"] : [],
        },
      },
    },
    activeChallenges: {
      [childId]: { challengeId: "rotation-challenge", missionId: "rotation-mission" },
    },
    version,
  };
}

before(async () => {
  assert.ok(adminRevealCode, "ADMIN_REVEAL_CODE must be configured for the integration test");

  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string", "The test server did not expose a port");
  baseUrl = `http://127.0.0.1:${address.port}`;

  const admin = await expectStatus(accountAction("admin-reveal"), 200, {
    method: "POST",
    body: { code: adminRevealCode },
  });
  assert.equal(admin.ok, true);
  assert.equal(typeof admin.token, "string");
  adminToken = admin.token as string;

  const family = await expectStatus(accountAction("admin-create-family"), 201, {
    method: "POST",
    token: adminToken,
    body: { name: familyName, username: familyUsername, code: oldFamilyCode },
  });
  const createdFamily = family.family as Json;
  familyId = createdFamily.id as string;

  const owner = await expectStatus(accountAction("admin-create-member"), 201, {
    method: "POST",
    token: adminToken,
    body: { familyId, role: "owner", name: "ولي الأمر التجريبي" },
  });
  ownerId = ((owner.member as Json).id as string);

  const child = await expectStatus(accountAction("admin-create-member"), 201, {
    method: "POST",
    token: adminToken,
    body: {
      familyId,
      role: "child",
      name: "الطفل التجريبي",
      grade: "الصف التجريبي",
    },
  });
  childId = ((child.member as Json).id as string);
});

after(async () => {
  try {
    if (familyId && adminToken) {
      await api(accountAction("admin-delete-family"), {
        method: "POST",
        token: adminToken,
        body: { familyId, confirm: true },
      });
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await pool.end();
  }
});

test("rotating the unified kingdom code invalidates old sessions and keeps all family features on the new code", async () => {
  const members = await expectStatus(accountAction("family-members"), 200, {
    familyCode: oldFamilyCode,
    familyUsername,
  });
  const listedMembers = members.members as Json[];
  assert.deepEqual(
    listedMembers.map((member) => member.role).sort(),
    ["child", "owner"],
    "The unified code should expose both the child profile and the parent observatory",
  );

  const childSession = await expectStatus(accountAction("verify-member"), 200, {
    method: "POST",
    familyCode: oldFamilyCode,
    familyUsername,
    body: { memberId: childId, code: oldFamilyCode, role: "child" },
  });
  oldChildToken = childSession.token as string;
  assert.equal(childSession.role, "child");

  const ownerSession = await expectStatus(accountAction("verify-member"), 200, {
    method: "POST",
    familyCode: oldFamilyCode,
    familyUsername,
    body: { memberId: ownerId, code: oldFamilyCode, role: "owner" },
  });
  oldOwnerToken = ownerSession.token as string;
  assert.equal(ownerSession.role, "owner");

  const initialState = kingdomStateBody(8, "مهمة قبل التدوير");
  await expectStatus("/api/kingdom-state", 200, {
    method: "PUT",
    familyCode: oldFamilyCode,
    token: oldOwnerToken,
    body: initialState,
  });

  await expectStatus(accountAction("admin-change-family-code"), 200, {
    method: "POST",
    token: adminToken,
    body: { familyId, newCode: newFamilyCode },
  });

  await expectStatus(accountAction("family-members"), 404, {
    familyCode: oldFamilyCode,
    familyUsername,
  });
  await expectStatus(accountAction("bootstrap-family"), 404, {
    method: "POST",
    familyCode: oldFamilyCode,
    familyUsername,
  });
  await expectStatus(accountAction("verify-member"), 404, {
    method: "POST",
    familyCode: oldFamilyCode,
    familyUsername,
    body: { memberId: childId, code: oldFamilyCode, role: "child" },
  });

  for (const token of [oldChildToken, oldOwnerToken]) {
    await expectStatus("/api/kingdom-state", 401, {
      familyCode: oldFamilyCode,
      token,
    });
    await expectStatus("/api/kingdom-state", 401, {
      familyCode: newFamilyCode,
      token,
    });
  }

  const newMembers = await expectStatus(accountAction("family-members"), 200, {
    familyCode: newFamilyCode,
    familyUsername,
  });
  assert.equal((newMembers.members as Json[]).length, 2);

  const newChildSession = await expectStatus(accountAction("verify-member"), 200, {
    method: "POST",
    familyCode: newFamilyCode,
    familyUsername,
    body: { memberId: childId, code: newFamilyCode, role: "child" },
  });
  const newChildToken = newChildSession.token as string;
  assert.equal(newChildSession.role, "child");
  assert.notEqual(newChildToken, oldChildToken);

  const newOwnerSession = await expectStatus(accountAction("verify-member"), 200, {
    method: "POST",
    familyCode: newFamilyCode,
    familyUsername,
    body: { memberId: ownerId, code: newFamilyCode, role: "owner" },
  });
  const newOwnerToken = newOwnerSession.token as string;
  assert.equal(newOwnerSession.role, "owner");
  assert.notEqual(newOwnerToken, oldOwnerToken);

  const savedState = await expectStatus("/api/kingdom-state", 200, {
    familyCode: newFamilyCode,
    token: newChildToken,
  });
  assert.deepEqual(savedState.state, initialState.state);
  assert.deepEqual(savedState.activeChallenges, initialState.activeChallenges);

  const updatedState = kingdomStateBody(13, "مهمة بعد التدوير", savedState.version as number);
  await expectStatus("/api/kingdom-state", 200, {
    method: "PUT",
    familyCode: newFamilyCode,
    token: newChildToken,
    body: updatedState,
  });
  const parentState = await expectStatus("/api/kingdom-state", 200, {
    familyCode: newFamilyCode,
    token: newOwnerToken,
  });
  assert.deepEqual(parentState.state, updatedState.state);
  assert.deepEqual(parentState.activeChallenges, updatedState.activeChallenges);
});