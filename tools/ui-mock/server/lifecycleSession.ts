import { randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

export type Pc1ActorRole = "TRUSTED_TESTER" | "CAMP_USER" | "OWNER" | "ADMIN";
export type Pc1Capability = "CAMP_USER_WORKSPACE_WRITE" | "LIFECYCLE_SCAN_NOW";
export type Pc1SessionContext = {
  actor_id: string;
  role: Pc1ActorRole;
  capabilities: Pc1Capability[];
  session_id: string;
};

const COOKIE_NAME = "crypto_edge_pc1_session";

export function createPc1SessionContextService(options: { defaultRole?: Pc1ActorRole } = {}) {
  const sessions = new Map<string, Pc1SessionContext>();
  const defaultRole = options.defaultRole ?? roleFromEnvironment();
  const create = (role: Pc1ActorRole): { context: Pc1SessionContext; setCookie: string } => {
    const token = randomBytes(32).toString("base64url");
    const context: Pc1SessionContext = {
      actor_id: actorIdForRole(role),
      role,
      capabilities: capabilitiesForRole(role),
      session_id: `pc1_${randomUUID()}`,
    };
    sessions.set(token, context);
    return { context, setCookie: `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict` };
  };
  return {
    resolve(req: IncomingMessage): { context: Pc1SessionContext; setCookie?: string } {
      const token = readCookie(req.headers.cookie, COOKIE_NAME);
      const context = token ? sessions.get(token) : undefined;
      return context ? { context } : create(defaultRole);
    },
    setReviewRole(role: "CAMP_USER" | "OWNER"): { context: Pc1SessionContext; setCookie: string } { return create(role); },
  };
}

function roleFromEnvironment(): Pc1ActorRole {
  const value = process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
  return value === "CAMP_USER" || value === "OWNER" || value === "ADMIN" || value === "TRUSTED_TESTER"
    ? value
    : "TRUSTED_TESTER";
}

function actorIdForRole(role: Pc1ActorRole): string {
  // The server assigns a pseudonymous actor per CAMP session. Neither a role
  // nor an actor identifier is accepted from browser payloads.
  if (role === "CAMP_USER") return `camp-user-${randomUUID().replace(/-/g, "")}`;
  if (role === "OWNER") return "pc1-owner";
  if (role === "ADMIN") return "pc1-admin";
  return "trusted-tester";
}

function capabilitiesForRole(role: Pc1ActorRole): Pc1Capability[] {
  if (role === "CAMP_USER") return ["CAMP_USER_WORKSPACE_WRITE"];
  if (role === "OWNER" || role === "ADMIN") return ["CAMP_USER_WORKSPACE_WRITE", "LIFECYCLE_SCAN_NOW"];
  return [];
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const value of header.split(";")) {
    const [key, raw] = value.trim().split("=", 2);
    if (key === name && raw && /^[A-Za-z0-9_-]{20,128}$/.test(raw)) return raw;
  }
  return null;
}
