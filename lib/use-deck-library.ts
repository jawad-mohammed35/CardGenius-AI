"use client";

import { useEffect, useState } from "react";
import { useCloudAccount } from "./cloud-account";
import { getDeckLibrary, subscribeToLibrary, type DeckLibrary, type DeckScope } from "./deck-storage";

export function useDeckScope(): DeckScope {
  const { user } = useCloudAccount();
  return user ? `cloud:${user.id}` : "guest";
}

export function useDeckLibrary(scope: DeckScope) {
  const [snapshot, setSnapshot] = useState<{ scope: DeckScope; data: DeckLibrary | null; failed: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    let generation = 0;
    function refresh() {
      const current = ++generation;
      getDeckLibrary(scope).then(
        (data) => { if (active && current === generation) setSnapshot({ scope, data, failed: false }); },
        () => { if (active && current === generation) setSnapshot({ scope, data: null, failed: true }); },
      );
    }

    refresh();
    window.addEventListener("focus", refresh);
    const unsubscribe = subscribeToLibrary(scope, refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      unsubscribe();
    };
  }, [scope]);

  return snapshot?.scope === scope ? snapshot : { scope, data: null, failed: false };
}
