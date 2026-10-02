import { ingest } from "@/lib/rss";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { errorMessage } from "@/lib/logs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await ingest());
  } catch (e) {
    console.error("[api/ingest]", e);
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
