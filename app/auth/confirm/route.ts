import type { NextRequest } from "next/server";
import { authConfigured } from "../../../lib/supabase/config";
import { serverSupabase } from "../../../lib/supabase/server";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const hash = query.get("token_hash");
  const type = query.get("type");
  const recovery = type === "recovery";
  let destination = recovery ? "/forgot-password?notice=expired" : "/sign-in?notice=expired";
  if (hash && hash.length <= 256 && (type === "email" || type === "recovery") && authConfigured) {
    const client = await serverSupabase();
    const result = await client.auth.verifyOtp({ token_hash: hash, type });
    if (!result.error) destination = recovery ? "/reset-password" : "/account";
  }
  return new Response(null, { status: 303, headers: { Location: destination, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
