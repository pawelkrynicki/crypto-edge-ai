import { createHmac, randomUUID } from "node:crypto";
import { protectedProcedure, router } from "../trpc";

const LAUNCH_TTL_SECONDS = 60;

/**
 * Paweł: podłącz tutaj istniejące authenticated users.id z AIKINTEL.
 * Never read an email, role, query parameter or browser-provided identity.
 */
function resolveAikintelUserId(ctx: { user?: { id?: string | number | null } }): string {
  const userId = ctx.user?.id;
  if (userId === undefined || userId === null || String(userId).trim() === "") {
    throw new Error("AIKINTEL_AUTH_REQUIRED");
  }
  return String(userId);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.length < 32) throw new Error(`${name}_MISSING_OR_WEAK`);
  return value;
}

function signLaunchCredential(subject: string): string {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const payload = {
    version: "aikintel_launch_v1",
    issuer: process.env.CRYPTO_EDGE_SSO_ISSUER?.trim() || "aikintel",
    audience: process.env.CRYPTO_EDGE_SSO_AUDIENCE?.trim() || "crypto-edge",
    subject,
    issued_at: issuedAt,
    expires_at: issuedAt + LAUNCH_TTL_SECONDS,
    jti: randomUUID(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", requiredEnv("CRYPTO_EDGE_SSO_SECRET")).update(encoded, "utf8").digest("base64url");
  return `${encoded}.${signature}`;
}

export const cryptoEdgeRouter = router({
  launch: protectedProcedure.mutation(({ ctx }) => {
    const subject = resolveAikintelUserId(ctx);
    const baseUrl = process.env.CRYPTO_EDGE_BASE_URL?.trim();
    if (!baseUrl) throw new Error("CRYPTO_EDGE_BASE_URL_MISSING");
    const launchUrl = new URL("/api/auth/aikintel/exchange", baseUrl);
    launchUrl.searchParams.set("credential", signLaunchCredential(subject));
    return { launchUrl: launchUrl.toString() };
  }),
});

