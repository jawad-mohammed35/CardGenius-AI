import type { Metadata } from "next";
import { AccountPreview } from "../components/account/account-preview";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return <AccountPreview />;
}
