import type { Metadata } from "next";
import { PreviewLoader } from "@/components/game/PreviewLoader";

export const metadata: Metadata = { title: "Preview · Life RPG" };

/** Always shows the sample-data preview: handy for trying changes safely. */
export default function PreviewPage() {
  return <PreviewLoader />;
}
