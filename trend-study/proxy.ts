import { NextResponse, type NextRequest } from "next/server";

// サイト全体のベーシック認証。BASIC_AUTH_USER / BASIC_AUTH_PASSWORD が未設定なら鍵なしで通す。
export function proxy(request: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const bytes = Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);
      const sep = decoded.indexOf(":");
      if (sep >= 0 && decoded.slice(0, sep) === user && decoded.slice(sep + 1) === password) {
        return NextResponse.next();
      }
    } catch {
      // 不正なヘッダーは認証失敗として扱う
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="trend-study", charset="UTF-8"' },
  });
}

export const config = {
  // /api/daily と /api/ingest は自動実行用のため対象外（CRON_SECRET で守る）
  matcher: ["/((?!api/daily|api/ingest|_next/static|_next/image|favicon.ico).*)"],
};
