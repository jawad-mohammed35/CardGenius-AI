import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authConfigured, supabasePublicKey, supabaseUrl } from "./config";

export async function serverSupabase() {
  if (!authConfigured) throw new Error("Sign-in setup is incomplete.");
  const jar = await cookies();
  return createServerClient(supabaseUrl, supabasePublicKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => {
        try { items.forEach(({ name, value, options }) => jar.set(name, value, options)); }
        catch { /* The proxy refreshes cookies for Server Components. */ }
      },
    },
  });
}
