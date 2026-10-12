import Link from "next/link";
import { BostaAccount } from "@/components/BostaAccount";
import type { Snapshot } from "@/lib/types";
import snapshot from "../../../data/latest.json";

export default function BostaPage() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">حساب بوسطة — الوضع الحالي</h1>
        <Link href="/" className="text-sm underline" style={{ color: "var(--text-secondary)" }}>
          ← الداشبورد العام
        </Link>
      </header>
      <BostaAccount summary={(snapshot as Snapshot).bosta} />
    </div>
  );
}
