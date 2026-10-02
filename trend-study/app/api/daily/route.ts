import { runDaily } from "@/lib/daily";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { isDateString, jstDate } from "@/lib/date";
import { errorMessage } from "@/lib/logs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const date = new URL(request.url).searchParams.get("date") ?? undefined;
  if (date !== undefined && (!isDateString(date) || date > jstDate())) {
    return Response.json({ error: "date は今日以前の YYYY-MM-DD で指定してください" }, { status: 400 });
  }
  const trigger = (request.headers.get("user-agent") ?? "").includes("vercel-cron") ? "cron" : "api";

  try {
    return Response.json(await runDaily({ trigger, date }));
  } catch (e) {
    console.error("[api/daily]", e);
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
