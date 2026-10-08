"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TaskConsole from "../TaskConsole";
import DesktopConnectionCard from "../DesktopConnectionCard";
import { api } from "../../lib/api";
import { actions, statuses } from "../../lib/labels";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pl-PL");
}

export default function JobDetailsPage({ id }) {
  const router = useRouter();
  const [job, setJob] = useState(null);
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState("");
  const [terminalStatus, setTerminalStatus] = useState("Oczekiwanie na logi…");

  const refresh = useCallback(async () => {
    const result = await api(`/api/jobs/${encodeURIComponent(id)}`);
    setJob(result);
    setError("");
    return result;
  }, [id]);

  useEffect(() => {
    let active = true;
    let timer;
    async function poll() {
      try {
        const result = await api(`/api/jobs/${encodeURIComponent(id)}`);
        if (!active) return;
        setJob(result);
        setError("");
        if (result.status === "running") timer = window.setTimeout(poll, 900);
      } catch (cause) {
        if (!active) return;
        setError(cause.message);
      }
    }
    poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [id]);

  useEffect(() => {
    if (!job || job.action !== "connect") return;
    api(`/api/targets/${encodeURIComponent(job.targetId)}/desktop-connection`)
      .then(setConnection)
      .catch((cause) => setError(cause.message));
  }, [job?.id, job?.action, job?.targetId]);

  async function stopJob() {
    try {
      await api(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
    } catch (cause) {
      setError(cause.message);
    }
  }

  const title = actions[job?.action] || "Job Ansible";

  return (
    <>
      <section className="welcome job-welcome">
        <div>
          <p className="eyebrow">SZCZEGÓŁY JOBA</p>
          <h1>{title}</h1>
          <p className="intro">{job?.targetName || "Ładowanie konfiguracji…"}</p>
        </div>
        <Link className="button secondary" href="/history">Historia jobów</Link>
      </section>

      {error && <p className="error-message" role="alert">{error}</p>}
      {!job && !error && <p className="empty" role="status">Wczytywanie joba…</p>}

      {job && (
        <>
          <section className="job-summary panel" aria-label="Informacje o jobie">
            <div className="job-summary-main">
              <span className={`job-state ${job.status}`}>{statuses[job.status] || job.status}</span>
              <span>{job.backend.toUpperCase()}</span>
              <code>{job.id}</code>
            </div>
            <dl>
              <div><dt>Konfiguracja</dt><dd>{job.targetName || job.targetId}</dd></div>
              <div><dt>Rozpoczęto</dt><dd>{formatDate(job.startedAt)}</dd></div>
              <div><dt>Zakończono</dt><dd>{formatDate(job.endedAt)}</dd></div>
            </dl>
          </section>

          {connection && <DesktopConnectionCard connection={connection} />}

          <TaskConsole
            open
            title={title}
            job={job}
            error=""
            interactive={Boolean(job.terminal && job.status === "running")}
            terminalStatus={terminalStatus}
            onTerminalState={setTerminalStatus}
            onClose={() => router.push("/history")}
            onStop={stopJob}
          />
        </>
      )}
    </>
  );
}
