import dynamic from "next/dynamic";
import { statuses } from "../lib/labels";

const TerminalView = dynamic(() => import("../TerminalView"), { ssr: false });

export default function TaskConsole({
  open,
  title,
  job,
  error,
  interactive,
  terminalStatus,
  onTerminalState,
  onClose,
  onStop,
}) {
  if (!open) return null;

  return (
    <section className="console panel" aria-live="polite">
      <div className="console-header">
        <div>
          <span className="live-dot" />
          <strong>{title}</strong>
          <span>
            {job
              ? `${job.backend.toUpperCase()} · ${new Date(job.startedAt).toLocaleTimeString("pl-PL")}`
              : ""}
          </span>
        </div>
        <button className="text-button" onClick={onClose}>
          Zamknij
        </button>
      </div>
      {interactive && job ? (
        <TerminalView
          key={job.id}
          jobId={job.id}
          onState={onTerminalState}
        />
      ) : (
        <pre className="task-log">
          {error || job?.output || "Uruchamianie zadania…"}
        </pre>
      )}
      <div className="console-footer">
        <span>
          {error ||
            (interactive
              ? terminalStatus
              : statuses[job?.status] || "Oczekiwanie na zadanie…")}
        </span>
        {job?.status === "running" && (
          <button className="text-button stop-button" onClick={onStop}>
            Zatrzymaj zadanie
          </button>
        )}
      </div>
    </section>
  );
}
