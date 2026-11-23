"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { browserSupabase } from "./supabase/browser";
import { authConfigured } from "./supabase/config";

type CloudProfile = {
  owner_id: string;
  display_name: string | null;
  avatar_icon: string;
  avatar_color: string;
  avatar_image: string | null;
  hide_provider_avatar: boolean;
  theme: string | null;
  accent: string | null;
  difficulty: string;
  card_count: number;
  auto_advance: boolean;
  animate_cards: boolean;
};

type ProfileChange = Partial<Omit<CloudProfile, "owner_id">>;
const accountContext = createContext<{
  user: User | null;
  profile: CloudProfile | null;
  ready: boolean;
  profileReady: boolean;
  saveProfile: (changes: ProfileChange) => Promise<void>;
}>({ user: null, profile: null, ready: !authConfigured, profileReady: !authConfigured, saveProfile: async () => { throw new Error("Sign in first."); } });

export function CloudAccountProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<{ user: User | null; ready: boolean }>({ user: null, ready: !authConfigured });
  const [snapshot, setSnapshot] = useState<{ owner: string; profile: CloudProfile | null }>();
  const owner = identity.user?.id;

  useEffect(() => {
    if (!authConfigured) return;
    const { data } = browserSupabase().auth.onAuthStateChange((_event, session) => {
      setIdentity({ user: session?.user ?? null, ready: true });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!owner) return;
    let active = true;
    function load() {
      void browserSupabase().from("profiles").select("*").eq("owner_id", owner).maybeSingle().then(({ data, error }) => {
        if (active) setSnapshot((previous) => error && previous?.owner === owner ? previous : { owner: owner!, profile: data as CloudProfile | null });
      });
    }
    load();
    window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("focus", load); };
  }, [owner]);

  const saveProfile = useCallback(async (changes: ProfileChange) => {
    if (!owner) throw new Error("Sign in first.");
    const { data, error } = await browserSupabase().from("profiles")
      .upsert({ owner_id: owner, ...changes }).select("*").single();
    if (error) throw new Error("We couldn’t save your settings. Try again.");
    setSnapshot({ owner, profile: data as CloudProfile });
  }, [owner]);

  return <accountContext.Provider value={{ ...identity, profile: owner && snapshot?.owner === owner ? snapshot.profile : null,
    profileReady: !owner || snapshot?.owner === owner, saveProfile }}>{children}</accountContext.Provider>;
}

export function useCloudAccount() { return useContext(accountContext); }
