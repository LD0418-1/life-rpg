import type { Metadata } from "next";
import { signInAction } from "@/app/actions";
import { SlashButton } from "@/components/ui/SlashButton";

export const metadata: Metadata = { title: "Login · Life RPG" };

const fieldClass = "w-full bg-ink-3 px-3 py-2 text-paper outline-none focus:ring-2 focus:ring-crimson";
const labelClass = "mb-1 block font-label text-sm font-extrabold tracking-widest text-muted uppercase";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 -rotate-3 font-display text-6xl uppercase">
          Player <span className="bg-crimson px-2">login</span>
        </h1>
        <form action={signInAction} className="slash-panel space-y-4 border-l-4 border-crimson bg-ink-2 p-6">
          {error && <p role="alert" className="bg-paper px-3 py-2 text-sm text-ink">Wrong email or password.</p>}
          <div>
            <label htmlFor="email" className={labelClass}>Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required className={fieldClass} />
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className={fieldClass} />
          </div>
          <SlashButton type="submit" className="w-full">Start</SlashButton>
        </form>
      </div>
    </main>
  );
}
