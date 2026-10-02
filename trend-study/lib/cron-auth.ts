import "server-only";

/** CRON_SECRET が設定されていれば Authorization: Bearer <CRON_SECRET> を確認する */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
