import { createHash, timingSafeEqual } from "node:crypto";
import { readWorkerSecret } from "@/server/config";

export function workerAuthentication(request: Request) {
  const secret = readWorkerSecret();
  if (!secret) return 503;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(
    digest(request.headers.get("authorization") ?? ""),
    digest(`Bearer ${secret}`),
  )
    ? 200
    : 401;
}
