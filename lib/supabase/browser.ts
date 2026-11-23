import { createBrowserClient } from "@supabase/ssr";
import { authConfigured, supabasePublicKey, supabaseUrl } from "./config";

export function browserSupabase() {
  if (!authConfigured) throw new Error("Sign-in setup is incomplete.");
  return createBrowserClient(supabaseUrl, supabasePublicKey);
}
