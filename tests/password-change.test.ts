import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthApiError, type Session, type User } from "@supabase/supabase-js";
import { changeVerifiedPassword, validatePasswordChange, type AccountSession, type PasswordVerification } from "../lib/password-change.ts";

const current = "fixture-current-password";
const replacement = "fixture-new-password";

function fixture(providers: string[], { incorrect = false, verifiedId = "account" } = {}) {
  const calls: string[] = [];
  const user = {
    id: "account", email: "fixture@example.net",
    identities: providers.map((provider) => ({ provider })),
  } as User;
  const verifiedUser = { ...user, id: verifiedId };
  const session: Session = { access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600, token_type: "bearer", user: verifiedUser };
  const browser: AccountSession = {
    getUser: async () => ({ data: { user }, error: null }),
    getSession: async () => ({ data: { session: { ...session, user } }, error: null }),
    setSession: async () => { calls.push("adopt"); return { data: { user, session }, error: null }; },
  };
  const verification: PasswordVerification = {
    signInWithPassword: async (input) => {
      calls.push("verify");
      assert.deepEqual(input, { email: user.email, password: current });
      if (incorrect) return { data: { user: null, session: null }, error: new AuthApiError("Invalid credentials", 400, "invalid_credentials") };
      return { data: { user: verifiedUser, session }, error: null };
    },
    updateUser: async (input) => {
      calls.push("update");
      assert.deepEqual(input, { password: replacement, current_password: current });
      return { data: { user }, error: null };
    },
    signOut: async () => { calls.push("discard"); return { error: null }; },
  };
  return { calls, browser, verification };
}

test("validates confirmation, password length in characters and bytes, and reuse", () => {
  assert.match(validatePasswordChange(current, replacement, "different") ?? "", /don’t match/);
  assert.match(validatePasswordChange(current, "short", "short") ?? "", /at least 10/);
  assert.match(validatePasswordChange(current, "😊".repeat(19), "😊".repeat(19)) ?? "", /72 bytes/);
  assert.match(validatePasswordChange(current, current, current) ?? "", /different password/);
  assert.equal(validatePasswordChange(current, replacement, replacement), null);
});

test("does not update the password when current-password authentication fails", async () => {
  const { browser, verification, calls } = fixture(["email"], { incorrect: true });
  assert.match(await changeVerifiedPassword(browser, verification, "account", current, replacement) ?? "", /incorrect/);
  assert.deepEqual(calls, ["verify", "discard"]);
});

test("rejects Google-only accounts and authentication as another identity", async () => {
  const google = fixture(["google"]);
  assert.ok(await changeVerifiedPassword(google.browser, google.verification, "account", current, replacement));
  assert.deepEqual(google.calls, ["discard"]);
  const other = fixture(["email"], { verifiedId: "different-account" });
  assert.ok(await changeVerifiedPassword(other.browser, other.verification, "account", current, replacement));
  assert.deepEqual(other.calls, ["verify", "discard"]);
});

test("updates a linked account only after verifying its email password", async () => {
  const { browser, verification, calls } = fixture(["google", "email"]);
  assert.equal(await changeVerifiedPassword(browser, verification, "account", current, replacement), null);
  assert.deepEqual(calls, ["verify", "update", "adopt"]);
});
