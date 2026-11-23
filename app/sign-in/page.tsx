import type { Metadata } from "next";
import { AuthForm } from "../components/account/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return <AuthForm mode="sign-in" expired={(await searchParams).notice === "expired"} />;
}
