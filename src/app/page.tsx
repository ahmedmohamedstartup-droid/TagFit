import { Dashboard } from "@/components/Dashboard";
import type { Snapshot } from "@/lib/types";
import snapshot from "../../data/latest.json";

export default function Home() {
  return <Dashboard snapshot={snapshot as Snapshot} />;
}
