// Step 2 of connecting Strava: Strava sends you back here with a one-time code.
import { NextResponse, type NextRequest } from "next/server";
import { stravaToken } from "@/lib/server/imports";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const back = (q: string) => {
    const res = NextResponse.redirect(`${origin}/inbox?${q}`);
    res.cookies.delete({ name: "strava_state", path: "/api/strava" });
    return res;
  };
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back(`error=${encodeURIComponent("You didn't allow access on Strava.")}`);
  const state = params.get("state");
  const code = params.get("code");
  if (!state || !code || state !== request.cookies.get("strava_state")?.value) {
    return back(`error=${encodeURIComponent("That Strava sign-in expired. Try connecting again.")}`);
  }
  const supabase = await createClient();
  const { data: isOwner } = await supabase.rpc("is_owner");
  if (isOwner !== true) return NextResponse.redirect(`${origin}/login`);
  try {
    const tok = await stravaToken({ grant_type: "authorization_code", code });
    const athlete = [tok.athlete?.firstname, tok.athlete?.lastname].filter(Boolean).join(" ") || null;
    const { error } = await supabase
      .from("import_connections")
      .upsert({ source: "strava", secret: tok.refresh_token, settings: { athlete }, last_synced_at: null }, { onConflict: "source" });
    if (error) throw new Error(error.message);
    return back("connected=strava");
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "Couldn't connect Strava.")}`);
  }
}
