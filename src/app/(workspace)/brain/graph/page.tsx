"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BrainGraphPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/knowledge?categories=note");
  }, [router]);
  return null;
}
