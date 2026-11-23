import { redirect } from "next/navigation";
import { authConfigured } from "../../lib/supabase/config";
import { serverSupabase } from "../../lib/supabase/server";

export default async function PrivateAccount({ children }: { children: React.ReactNode }) {
  if (!authConfigured) redirect("/sign-in");
  const client = await serverSupabase();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect("/sign-in");
  return children;
}
