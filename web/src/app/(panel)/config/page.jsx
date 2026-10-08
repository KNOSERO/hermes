"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ConfigurationPage from "../../../components/pages/ConfigurationPage";

function ConfigurationRouteContent() {
  const targetId = useSearchParams().get("targetId");
  return <ConfigurationPage selectedTargetId={targetId} />;
}

export default function ConfigRoute() {
  return (
    <Suspense fallback={<p className="empty">Wczytywanie konfiguracji…</p>}>
      <ConfigurationRouteContent />
    </Suspense>
  );
}
