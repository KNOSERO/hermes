"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import JobDetailsPage from "../../../components/pages/JobDetailsPage";

function JobRouteContent() {
  const id = useSearchParams().get("id");
  return id ? <JobDetailsPage id={id} /> : <p className="empty">Wybierz job z listy po lewej.</p>;
}

function JobLoading() {
  return (
    <>
      <section className="welcome job-welcome">
        <div>
          <p className="eyebrow">SZCZEGÓŁY JOBA</p>
          <h1>Otwieram job…</h1>
          <p className="intro">Pobieram status i logi zadania.</p>
        </div>
      </section>
      <section className="panel job-summary" aria-busy="true">
        <p className="empty" role="status">Łączenie z panelem…</p>
      </section>
    </>
  );
}

export default function JobRoute() {
  return (
    <Suspense fallback={<JobLoading />}>
      <JobRouteContent />
    </Suspense>
  );
}
