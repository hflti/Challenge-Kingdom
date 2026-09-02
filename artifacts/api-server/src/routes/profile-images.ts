import { createHmac, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Router, type IRouter } from "express";
import { memberFromRequest } from "../lib/member-auth";

const router: IRouter = Router();
const sidecarEndpoint = "http://127.0.0.1:1106";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageBytes = 50 * 1024 * 1024;

function familyKeyFromCode(code: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required.");
  return createHmac("sha256", secret).update(code).digest("hex");
}

function privateObjectDir(): string {
  const value = process.env.PRIVATE_OBJECT_DIR;
  if (!value) throw new Error("PRIVATE_OBJECT_DIR is required.");
  return value.replace(/\/+$/, "");
}

function parseObjectPath(path: string) {
  const parts = path.replace(/^\/+/, "").split("/");
  if (parts.length < 2) throw new Error("Invalid object path.");
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

async function signObjectUrl(folder: "profile-images" | "reward-images", objectId: string, method: "GET" | "PUT") {
  const { bucketName, objectName } = parseObjectPath(`${privateObjectDir()}/${folder}/${objectId}`);
  const response = await fetch(`${sidecarEndpoint}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Unable to sign object URL (${response.status}).`);
  return (await response.json() as { signed_url: string }).signed_url;
}

router.post("/storage/profile-images/request-url", async (req, res) => {
  const familyCode = req.header("x-family-code")?.trim();
  const { size, contentType } = req.body as { size?: unknown; contentType?: unknown };
  if (!familyCode || familyCode.length < 4 || familyCode.length > 64) {
    res.status(400).json({ error: "A valid family code is required." });
    return;
  }
  const member = await memberFromRequest(req, familyKeyFromCode(familyCode));
  if (!member || member.role !== "owner") {
    res.status(401).json({ error: "Parent authorization is required." });
    return;
  }
  if (!Number.isInteger(size) || Number(size) < 1 || Number(size) > maxImageBytes || typeof contentType !== "string" || !allowedTypes.has(contentType)) {
    res.status(400).json({ error: "Choose a JPG, PNG, or WebP image smaller than 50 MB." });
    return;
  }
  try {
    const objectId = randomUUID();
    res.json({
      uploadURL: await signObjectUrl("profile-images", objectId, "PUT"),
      photoUrl: `/api/storage/profile-images/${objectId}`,
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to prepare profile image upload");
    res.status(500).json({ error: "Failed to prepare image upload." });
  }
});

router.get("/storage/profile-images/:objectId", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.objectId)) {
    res.status(404).end();
    return;
  }
  try {
    const response = await fetch(await signObjectUrl("profile-images", req.params.objectId, "GET"));
    if (!response.ok || !response.body) {
      res.status(response.status).end();
      return;
    }
    res.status(200);
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
  } catch (error) {
    req.log.error({ err: error }, "Failed to serve profile image");
    res.status(404).end();
  }
});

router.post("/storage/reward-images/request-url", async (req, res) => {
  const familyCode = req.header("x-family-code")?.trim();
  const { size, contentType } = req.body as { size?: unknown; contentType?: unknown };
  if (!familyCode || familyCode.length < 4 || familyCode.length > 64) {
    res.status(400).json({ error: "A valid family code is required." });
    return;
  }
  const member = await memberFromRequest(req, familyKeyFromCode(familyCode));
  if (!member || member.role !== "owner") {
    res.status(401).json({ error: "Parent authorization is required." });
    return;
  }
  if (!Number.isInteger(size) || Number(size) < 1 || Number(size) > maxImageBytes || typeof contentType !== "string" || !allowedTypes.has(contentType)) {
    res.status(400).json({ error: "Choose a JPG, PNG, or WebP image smaller than 50 MB." });
    return;
  }
  try {
    const objectId = randomUUID();
    res.json({
      uploadURL: await signObjectUrl("reward-images", objectId, "PUT"),
      imageUrl: `/api/storage/reward-images/${objectId}`,
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to prepare reward image upload");
    res.status(500).json({ error: "Failed to prepare reward image upload." });
  }
});

router.get("/storage/reward-images/:objectId", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.objectId)) {
    res.status(404).end();
    return;
  }
  try {
    const response = await fetch(await signObjectUrl("reward-images", req.params.objectId, "GET"));
    if (!response.ok || !response.body) {
      res.status(response.status).end();
      return;
    }
    res.status(200);
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
  } catch (error) {
    req.log.error({ err: error }, "Failed to serve reward image");
    res.status(404).end();
  }
});

export default router;