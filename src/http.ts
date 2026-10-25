import { createHash, timingSafeEqual } from "node:crypto";
import { dispatch, type PrefixStore } from "./commands";
import { logger } from "./logging";

type HttpRequest = {
  method: string;
  headers?: Record<string, string[]>;
  body?: string;
};
type HttpResponse = {
  statusCode: number;
  headers: Record<string, string[]>;
  body: string;
};
const plain = (statusCode: number, body: string): HttpResponse => ({
  statusCode,
  body,
  headers: { "Content-Type": ["text/plain; charset=utf-8"] },
});
const header = (headers: HttpRequest["headers"], name: string): string[] =>
  Object.entries(headers ?? {})
    .filter(([key]) => key.toLowerCase() === name)
    .flatMap(([, values]) => values);

/** No caller identity is derived from the client-supplied JSON. */
export async function handleHttp(
  event: HttpRequest,
  secret: string | undefined,
  store: PrefixStore,
): Promise<HttpResponse> {
  const reject = (statusCode: number, body: string): HttpResponse => {
    logger.warn(
      { operation: "http.reject", statusCode },
      "HTTP request rejected before RPC dispatch; request data omitted",
    );
    return plain(statusCode, body);
  };
  if (event.method !== "POST") return reject(405, "Method Not Allowed");
  const media = header(event.headers, "content-type");
  if (
    media.length !== 1 ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(media[0] ?? "")
  ) {
    return reject(415, "Unsupported Media Type");
  }
  if (Buffer.byteLength(event.body ?? "", "utf8") > 16_384) {
    return reject(413, "Payload Too Large");
  }
  if (!secret) {
    logger.error(
      {
        operation: "http.authenticate",
        errorCode: "RUNTIME_SECRET_MISSING",
        setting: "RPC_BEARER_SECRET",
        statusCode: 503,
      },
      "RPC_BEARER_SECRET is missing or empty in the active Forge runtime. Provision the encrypted runtime variable and redeploy.",
    );
    return plain(503, "Service Unavailable");
  }
  const authorization = header(event.headers, "authorization");
  if (
    authorization.length !== 1 ||
    !/^Bearer [A-Za-z0-9._~+/-]+=?=?$/.test(authorization[0] ?? "")
  ) {
    return reject(401, "Unauthorized");
  }
  const supplied = authorization[0]?.slice(7) ?? "";
  // Hash to equal-sized buffers before the constant-time comparison.
  const actual = createHash("sha256").update(secret).digest();
  const claimed = createHash("sha256").update(supplied).digest();
  if (!timingSafeEqual(actual, claimed)) return reject(401, "Unauthorized");
  const result = await dispatch(
    event.body ?? "",
    { source: "api", authorized: true },
    store,
  );
  return {
    statusCode: 200,
    body: JSON.stringify(result),
    headers: { "Content-Type": ["application/json"] },
  };
}
