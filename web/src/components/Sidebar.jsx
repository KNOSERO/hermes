"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { actions, statuses } from "../lib/labels";
import { api } from "../lib/api";

function sameRows(current, next, fields) {
  return current.length === next.length && current.every((row, index) =>
    fields.every((field) => row[field] === next[index][field]),
  );
}

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const currentPath = pathname.replace(/\/$/, "") || "/";
  const [targets, setTargets] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [openSections, setOpenSections] = useState({ configs: true, jobs: true });

  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem("hermes-sidebar") || "{}");
      setOpenSections({ configs: saved.configs !== false, jobs: saved.jobs !== false });
    } catch {}
  }, []);

  function rememberSection(name, event) {
    const open = event.currentTarget.open;
    setOpenSections((current) => ({ ...current, [name]: open }));
    try {
      const saved = JSON.parse(window.sessionStorage.getItem("hermes-sidebar") || "{}");
      window.sessionStorage.setItem("hermes-sidebar", JSON.stringify({ ...saved, [name]: open }));
    } catch {}
  }

  useEffect(() => {
    let active = true;
    async function refresh() {
      const results = await Promise.allSettled([
        api("/api/targets"),
        api("/api/jobs"),
      ]);
      if (!active) return;
      if (results[0].status === "fulfilled") {
        const nextTargets = results[0].value.targets || [];
        setTargets((current) =>
          sameRows(current, nextTargets, ["id", "name", "backend"])
            ? current
            : nextTargets,
        );
      }
      if (results[1].status === "fulfilled") {
        const nextJobs = (results[1].value.jobs || []).slice(0, 5);
        setJobs((current) =>
          sameRows(current, nextJobs, ["id", "action", "backend", "targetName", "status"])
            ? current
            : nextJobs,
        );
      }
    }
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSelectedTargetId(params.get("targetId") || "");
    setSelectedJobId(params.get("id") || "");
  }, [pathname]);

  const currentJob = (jobId) => currentPath === "/job" && selectedJobId === jobId;

  return (
    <aside className="rail" aria-label="Nawigacja panelu">
      <Link className="brand" href="/" aria-label="Hermes Local — strona główna">
        <span className="brand-mark">H</span>
        <span>
          <strong>Hermes</strong>
          <small>LOCAL CONTROL</small>
        </span>
      </Link>
      <div className="sidebar-collections">
        <section className="sidebar-section">
          <details className="sidebar-accordion" open={openSections.configs} onToggle={(event) => rememberSection("configs", event)}>
            <summary id="sidebar-configs">
              <span>Konfiguracje</span><span className="menu-caret" aria-hidden="true" />
            </summary>
            <nav className="sidebar-list" aria-labelledby="sidebar-configs">
              {targets.map((target) => {
                const href = `/config?targetId=${encodeURIComponent(target.id)}`;
                const selected = currentPath === "/config" && selectedTargetId === target.id;
                return (
                  <button className={`sidebar-item ${selected ? "active" : ""}`} type="button" key={target.id} title={target.name} onClick={() => {
                    setSelectedTargetId(target.id);
                    router.push(href);
                  }}>
                    <span className={`sidebar-item-icon ${target.backend}`} aria-hidden="true">{target.backend === "podman" ? "P" : target.backend === "docker" ? "D" : "K"}</span>
                    <span className="sidebar-item-copy"><strong>{target.name}</strong><small>{target.backend === "podman" ? "Lokalny Podman" : target.backend === "docker" ? "Docker · SSH" : "Kubernetes"}</small></span>
                  </button>
                );
              })}
              {!targets.length && <p className="sidebar-empty">Brak konfiguracji</p>}
            </nav>
          </details>
        </section>

        <section className="sidebar-section">
          <details className="sidebar-accordion" open={openSections.jobs} onToggle={(event) => rememberSection("jobs", event)}>
            <summary id="sidebar-jobs">
              <span>Ostatnie joby</span><span className="menu-caret" aria-hidden="true" />
            </summary>
            <nav className="sidebar-list" aria-labelledby="sidebar-jobs">
              {jobs.map((job) => (
                <Link className={`sidebar-item ${currentJob(job.id) ? "active" : ""}`} href={`/job?id=${encodeURIComponent(job.id)}`} key={job.id} title={actions[job.action] || job.action} onClick={() => setSelectedJobId(job.id)}>
                  <span className={`sidebar-job-mark ${job.status}`} aria-hidden="true">{job.status === "running" ? "◌" : job.status === "succeeded" ? "✓" : "!"}</span>
                  <span className="sidebar-item-copy"><strong>{actions[job.action] || job.action}</strong><small>{job.targetName || job.backend.toUpperCase()} · {statuses[job.status] || job.status}</small></span>
                </Link>
              ))}
              {!jobs.length && <p className="sidebar-empty">Nie uruchomiono jeszcze jobów</p>}
            </nav>
          </details>
        </section>
        <Link className={`sidebar-history-link ${currentPath === "/history" ? "active" : ""}`} href="/history">Pełna historia jobów →</Link>
      </div>
      <Link className="mobile-history-link" href="/history">Joby</Link>
      <div className="rail-bottom">
        <span className="status-dot" />
        <span>
          <strong>Panel lokalny</strong>
          <small>127.0.0.1 · bez logowania</small>
        </span>
      </div>
    </aside>
  );
}
