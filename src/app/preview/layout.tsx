import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PreviewLoader } from "@/components/game/PreviewLoader";

export const metadata: Metadata = { title: "Preview · Life RPG" };

/** The whole game on sample data: handy for trying things safely. */
export default function PreviewLayout({ children }: { children: ReactNode }) {
  return <PreviewLoader>{children}</PreviewLoader>;
}
