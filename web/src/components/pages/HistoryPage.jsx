import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import JobHistory from "../JobHistory";
import { api } from "../../lib/api";

export default function HistoryPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const result = await api("/api/jobs");
    setJobs(result.jobs);
  }, []);

  useEffect(() => {
    refresh().catch((cause) => setError(cause.message));
  }, [refresh]);

  function openJob(job) {
    router.push(`/job?id=${encodeURIComponent(job.id)}`);
  }

  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">WYKONANE JOBY</p>
          <h1>Historia jobów</h1>
          <p className="intro">
            Przeglądaj status i logi zadań uruchomionych z panelu.
          </p>
        </div>
      </section>
      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">OSTATNIE 30 JOBÓW</p>
            <h2>Wyniki</h2>
          </div>
          <button
            className="text-button"
            onClick={() => refresh().catch((cause) => setError(cause.message))}
          >
            Odśwież
          </button>
        </div>
        {error && <p className="error-message">{error}</p>}
        <JobHistory jobs={jobs} onOpen={openJob} />
      </section>
    </>
  );
}
