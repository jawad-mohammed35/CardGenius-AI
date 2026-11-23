"use client";

import { BookOpen, House, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCloudAccount } from "../lib/cloud-account";
import { useUserProfile } from "../lib/profile";
import { ProfileAvatar } from "./components/account/profile-avatar";
import { AppearanceControl } from "./appearance-control";

const pages = [
  { label: "Home", href: "/", icon: House },
  { label: "Study Decks", href: "/study-decks", icon: BookOpen },
];

const accountPaths = ["/sign-in", "/sign-up", "/forgot-password"];

export function SiteNav() {
  const pathname = usePathname();
  const { user } = useCloudAccount();
  const profile = useUserProfile();
  const firstName = profile.name.split(/\s+/)[0];
  const accountActive = pathname.startsWith("/account") || accountPaths.includes(pathname);

  return (
    <header className="site-header site-width">
      <nav className="site-nav" aria-label="Main navigation">
        <Link className="brand" href="/" aria-label="CardGeniusAI home">
          <svg className="brand-mark" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
            <rect width="40" height="40" rx="10" fill="currentColor" />
            <path d="M13 10h13a4 4 0 0 1 4 4v11a4 4 0 0 1-4 4h-2m-9-16h8a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4v-8a5 5 0 0 1 5-5Z" className="brand-glyph" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            <path d="m14.5 22 2.4 2.4 5-5.4" className="brand-glyph" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>CardGenius<span className="brand-ai">AI</span></span>
        </Link>
        <div className="nav-links">
          {pages.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className="nav-link">
                <Icon size={17} aria-hidden="true" /> {label}
              </Link>
            );
          })}
          <Link href={user ? "/account" : "/sign-in"} aria-current={accountActive ? "page" : undefined}
            className="nav-link nav-profile" title={user ? profile.name : "Sign In"}>
            {user ? <ProfileAvatar profile={profile} size={24} /> : <UserRound size={17} aria-hidden="true" />}
            <span>{user ? firstName : "Sign In"}</span>
          </Link>
        </div>
        <AppearanceControl />
      </nav>
    </header>
  );
}
