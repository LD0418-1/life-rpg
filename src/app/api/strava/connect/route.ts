// Step 1 of connecting Strava: send you to Strava's own login and approval page.
import { NextResponse, type NextRequest } from "next/server";
import { stravaConfigured } from "@/lib/server/imports";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const supabase = await createClient();
  const { data: isOwner } = await supabase.rpc("is_owner");
  if (isOwner !== true) return NextResponse.redirect(`${origin}/login`);
  if (!stravaConfigured()) return NextResponse.redirect(`${origin}/inbox?error=${encodeURIComponent("Strava isn't set up on the server yet.")}`);

  const state = crypto.randomUUID();
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", process.env.STRAVA_CLIENT_ID!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", `${origin}/api/strava/callback`);
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", "activity:read_all");
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url.toString());
  // Remembered for 10 minutes to check the reply really comes from this request.
  res.cookies.set("strava_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/strava" });
  return res;
}
