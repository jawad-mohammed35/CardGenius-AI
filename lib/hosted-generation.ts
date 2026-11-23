import { GenerationError } from "./generation-error";
import { authConfigured } from "./supabase/config";
import { serverSupabase } from "./supabase/server";

export async function verifyHostedGeneration(request: Request) {
  if (process.env.HOSTED_GEMINI !== "true" || !authConfigured) {
    throw new GenerationError("Hosted generation is still being configured.", 503);
  }
  if (!["US", "CA"].includes(request.headers.get("x-vercel-ip-country") ?? "")) {
    throw new GenerationError("Hosted Gemini generation is available in the United States and Canada.", 403);
  }
  if (request.headers.get("x-cardgenius-adult-training") !== "yes") {
    throw new GenerationError("Confirm you are 18 or older and using Gemini for professional learning or training.", 403);
  }
  const client = await serverSupabase();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new GenerationError("Sign in to generate a deck.", 401);

  return async (count: number) => {
    // Reserve a bounded allowance for batches and their one transport retry.
    const cost = Math.min(10, (Math.ceil(count / 25) + 1) * 2);
    const { data, error } = await client.rpc("cg_claim_generation", { p_cost: cost });
    if (error) throw new GenerationError("The generation allowance is temporarily unavailable. Try again later.", 503);
    if (data !== true) throw new GenerationError("The daily generation allowance has been reached. Try again tomorrow.", 429);
  };
}
