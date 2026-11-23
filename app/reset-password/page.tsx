import { redirect } from "next/navigation";
import { AuthForm } from "../components/account/auth-form";
import { authConfigured } from "../../lib/supabase/config";
import { serverSupabase } from "../../lib/supabase/server";

export default async function ResetPasswordPage() {
  if (!authConfigured) redirect("/forgot-password");
  const client = await serverSupabase();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect("/forgot-password?notice=expired");
  return <AuthForm mode="change" />;
}
