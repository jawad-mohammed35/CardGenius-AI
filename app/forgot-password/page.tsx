import type { Metadata } from "next";
import { AuthForm } from "../components/account/auth-form";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  return <AuthForm mode="reset" expired={(await searchParams).notice === "expired"} />;
}
