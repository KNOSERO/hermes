import JobHistory from "./JobHistory";

export default function ActivityPanel({ jobs, onOpen, onRefresh }) {
  return (
    <section className="panel activity" id="activity">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">OSTATNIE ZADANIA</p>
          <h2>Historia zadań</h2>
        </div>
        <button className="text-button" onClick={onRefresh}>
          Odśwież
        </button>
      </div>
      <JobHistory jobs={jobs} onOpen={onOpen} />
    </section>
  );
}
