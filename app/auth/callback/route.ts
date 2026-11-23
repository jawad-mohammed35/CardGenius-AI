import type { NextRequest } from "next/server";
import { safeAuthReturn } from "../../../lib/auth-paths";
import { authConfigured } from "../../../lib/supabase/config";
import { serverSupabase } from "../../../lib/supabase/server";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const code = query.get("code");
  const recovery = query.get("flow") === "recovery";
  let destination = recovery ? "/forgot-password?notice=expired" : "/sign-in?notice=expired";
  if (code && authConfigured) {
    const client = await serverSupabase();
    const result = await client.auth.exchangeCodeForSession(code);
    if (!result.error) destination = recovery ? "/reset-password" : safeAuthReturn(query.get("next"));
  }
  return new Response(null, { status: 303, headers: { Location: destination, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
