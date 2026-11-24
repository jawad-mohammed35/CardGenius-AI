"use client";

import { BookOpen, House, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCloudAccount } from "../lib/cloud-account";
import { useUserProfile } from "../lib/profile";
import { ProfileAvatar } from "./components/account/profile-avatar";
import { AppearanceControl } from "./appearance-control";
import brandMark from "./icon.png";

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
          <Image className="brand-mark" src={brandMark} alt="" width={42} height={42} loading="eager" />
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
