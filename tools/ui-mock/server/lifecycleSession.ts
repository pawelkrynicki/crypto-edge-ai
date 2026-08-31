import { randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  createCampUserIdentityRegistry,
  getDefaultCampUserIdentityRegistryPath,
  type CampUserIdentityRegistry,
} from "./campUserIdentityRegistry.js";

export type Pc1ActorRole = "TRUSTED_TESTER" | "CAMP_USER" | "OWNER" | "ADMIN";
export type Pc1Capability = "CAMP_USER_WORKSPACE_WRITE" | "LIFECYCLE_SCAN_NOW";
export type Pc1SessionContext = {
  actor_id: string;
  role: Pc1ActorRole;
  capabilities: Pc1Capability[];
  session_id: string;
};

const COOKIE_NAME = "crypto_edge_pc1_session";
const CAMP_COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export function createPc1SessionContextService(options: {
  defaultRole?: Pc1ActorRole;
  campIdentityRegistry?: CampUserIdentityRegistry;
  campIdentityRegistryPath?: string;
  cookieSecure?: boolean;
} = {}) {
  const sessions = new Map<string, Pc1SessionContext>();
  const defaultRole = options.defaultRole ?? roleFromEnvironment();
  const campIdentityRegistry = options.campIdentityRegistry
    ?? createCampUserIdentityRegistry({ databaseFilePath: options.campIdentityRegistryPath ?? getDefaultCampUserIdentityRegistryPath() });
  const cookieSecure = options.cookieSecure ?? process.env.CRYPTO_EDGE_CAMP_COOKIE_SECURE === "1";
  const create = (role: Pc1ActorRole): { context: Pc1SessionContext; setCookie: string } => {
    const token = randomBytes(32).toString("base64url");
    const context: Pc1SessionContext = {
      actor_id: role === "CAMP_USER" ? campIdentityRegistry.registerCookieToken(token) : actorIdForRole(role),
      role,
      capabilities: capabilitiesForRole(role),
      session_id: `pc1_${randomUUID()}`,
    };
    sessions.set(token, context);
    return { context, setCookie: sessionCookie(token, cookieSecure) };
  };
  return {
    resolve(req: IncomingMessage): { context: Pc1SessionContext; setCookie?: string } {
      const token = readCookie(req.headers.cookie, COOKIE_NAME);
      const context = token ? sessions.get(token) : undefined;
      if (context) return { context };
      if (token && defaultRole === "CAMP_USER") {
        const actorId = campIdentityRegistry.resolveActorId(token);
        if (actorId) {
          const restored: Pc1SessionContext = {
            actor_id: actorId,
            role: "CAMP_USER",
            capabilities: capabilitiesForRole("CAMP_USER"),
            session_id: `pc1_${randomUUID()}`,
          };
          sessions.set(token, restored);
          return { context: restored };
        }
      }
      return create(defaultRole);
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
  // Neither a role nor an actor identifier is accepted from browser payloads.
  if (role === "OWNER") return "pc1-owner";
  if (role === "ADMIN") return "pc1-admin";
  return "trusted-tester";
}

function sessionCookie(token: string, secure: boolean): string {
  const attributes = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${CAMP_COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
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
