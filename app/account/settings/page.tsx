import type { Metadata } from "next";
import { AccountPreview } from "../../components/account/account-preview";

export const metadata: Metadata = { title: "Account settings" };

export default function AccountSettingsPage() {
  return <AccountPreview settings />;
}
