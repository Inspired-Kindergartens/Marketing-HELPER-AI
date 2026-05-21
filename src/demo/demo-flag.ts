import type { FastifyReply, FastifyRequest } from "fastify";

const COOKIE_NAME = "mh_demo";

function clearLegacyDemoCookie(reply: FastifyReply) {
  reply.header("set-cookie", `${COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0`);
}

export function resolveDemo(
  request: FastifyRequest,
  reply: FastifyReply,
  query: { demo?: string } | undefined,
): boolean {
  if (request.headers.cookie?.includes(`${COOKIE_NAME}=`)) {
    clearLegacyDemoCookie(reply);
  }
  return query?.demo === "1";
}

export function isDemoRequest(query: { demo?: string } | null | undefined): boolean {
  return query?.demo === "1";
}

export function isDemoBody(body: { demo?: unknown } | null | undefined): boolean {
  return body?.demo === "1" || body?.demo === true;
}
