import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_SECRET = process.env.BICLI_TOKEN_SECRET || "bicli-dev-secret-change-in-production";
const TOKEN_TTL = 24 * 60 * 60 * 1000;

export function generateToken(userId: number, role: string): string {
  const payload = `${userId}:${role}:${Date.now()}`;
  const signature = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  const raw = `${payload}:${signature}`;
  return Buffer.from(raw).toString("base64");
}

export function verifyToken(token: string): { userId: number; role: string } | null {
  try {
    const raw = Buffer.from(token, "base64").toString("utf-8");
    const parts = raw.split(":");
    if (parts.length !== 4) return null;

    const [userIdStr, role, timestampStr, providedSig] = parts;
    const userId = parseInt(userIdStr, 10);
    const timestamp = parseInt(timestampStr, 10);

    if (isNaN(userId) || isNaN(timestamp)) return null;
    if (Date.now() - timestamp > TOKEN_TTL) return null;

    const payload = `${userId}:${role}:${timestamp}`;
    const expectedSig = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");

    const a = Buffer.from(providedSig, "utf-8");
    const b = Buffer.from(expectedSig, "utf-8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    return { userId, role };
  } catch {
    return null;
  }
}
