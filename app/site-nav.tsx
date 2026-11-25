"use client";

import { BookOpen, House, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { useCloudAccount } from "../lib/cloud-account";
import { defaultProfile, useUserProfile } from "../lib/profile";
import { ProfileAvatar } from "./components/account/profile-avatar";
import { AppearanceControl } from "./appearance-control";
import brandMark from "./icon.png";

const pages = [
  { label: "Home", href: "/", icon: House, filled: "M10.6 3.1a2.1 2.1 0 0 1 2.8 0l6.9 6.1c.5.4.7 1 .7 1.6V19a2 2 0 0 1-2 2h-4v-6a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v6H5a2 2 0 0 1-2-2v-8.2c0-.6.2-1.2.7-1.6z" },
  { label: "Study Decks", href: "/study-decks", icon: BookOpen, filled: "M2 5a1 1 0 0 1 1-1h4a6 6 0 0 1 4 1.5v14A6 6 0 0 0 7 18H3a1 1 0 0 1-1-1zm20 0a1 1 0 0 0-1-1h-4a6 6 0 0 0-4 1.5v14a6 6 0 0 1 4-1.5h4a1 1 0 0 0 1-1z" },
];

const accountPaths = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"];
const personFilled = "M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 11c5 0 8 2.8 8 6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1c0-3.2 3-6 8-6z";

function NavIcon({ Outline, filled }: { Outline: typeof House; filled: string }) {
  return <span className="nav-icon" aria-hidden="true">
    <Outline size={17} className="nav-icon-outline" />
    <svg width="17" height="17" viewBox="0 0 24 24" className="nav-icon-filled"><path fill="currentColor" d={filled} /></svg>
  </span>;
}

export function SiteNav() {
  const pathname = usePathname();
  const links = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const { user } = useCloudAccount();
  const profile = useUserProfile();
  const firstName = profile.name.split(/\s+/)[0];
  const accountActive = pathname.startsWith("/account") || accountPaths.includes(pathname);
  const hasAvatar = user && (profile.image || profile.providerImage || profile.icon !== defaultProfile.icon || profile.color !== defaultProfile.color);

  useLayoutEffect(() => {
    const group = links.current;
    const marker = indicator.current;
    if (!group || !marker) return;
    function measure() {
      if (!group || !marker) return;
      const active = group.querySelector<HTMLElement>('[aria-current="page"]');
      marker.hidden = !active;
      if (!active) return;
      marker.style.width = `${active.offsetWidth}px`;
      marker.style.height = `${active.offsetHeight}px`;
      marker.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
      marker.dataset.positioned = "";
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    group.querySelectorAll("a").forEach((link) => observer.observe(link));
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <header className="site-header site-width">
      <nav className="site-nav" aria-label="Main navigation">
        <Link className="brand" href="/" aria-label="CardGeniusAI home">
          <Image className="brand-mark" src={brandMark} alt="" width={42} height={42} loading="eager" />
          <span>CardGenius<span className="brand-ai">AI</span></span>
        </Link>
        <div className="nav-links" ref={links}>
          <span className="nav-indicator" ref={indicator} aria-hidden="true" />
          {pages.map(({ label, href, icon: Icon, filled }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className="nav-link">
                <NavIcon Outline={Icon} filled={filled} /> {label}
              </Link>
            );
          })}
          <Link href={user ? "/account" : "/sign-in"} aria-current={accountActive ? "page" : undefined}
            className="nav-link nav-profile" title={user ? profile.name : "Sign In"}>
            {hasAvatar ? <ProfileAvatar profile={profile} size={24} /> : <NavIcon Outline={UserRound} filled={personFilled} />}
            <span>{user ? firstName : "Sign In"}</span>
          </Link>
        </div>
        <AppearanceControl />
      </nav>
    </header>
  );
}
