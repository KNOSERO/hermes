import { actions, statuses } from "../lib/labels";

export default function JobHistory({ jobs, onOpen }) {
  if (!jobs.length)
    return (
      <p className="empty">
        Brak zadań. Uruchom operację, aby zobaczyć jej wynik.
      </p>
    );

  return (
    <div className="jobs-list">
      {jobs.map((job) => (
        <article className="job-item" key={job.id}>
          <div className="job-top">
            <span className="job-title">
              {actions[job.action] || job.action}
            </span>
            <span className={`job-state ${job.status}`}>
              {statuses[job.status] || job.status}
            </span>
          </div>
          <div className="job-meta">
            {job.targetName || job.backend.toUpperCase()} ·{" "}
            {new Date(job.startedAt).toLocaleTimeString("pl-PL")}
          </div>
          <button className="job-open" onClick={() => onOpen(job)}>
            Zobacz wynik →
          </button>
        </article>
      ))}
    </div>
  );
}
