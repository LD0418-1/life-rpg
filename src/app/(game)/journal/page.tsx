import { JournalView } from "@/components/game/views/JournalView";

// Writing a weekly recap with AI can take a while (Vercel's default limit is shorter).
export const maxDuration = 60;

export default function Page() {
  return <JournalView />;
}
