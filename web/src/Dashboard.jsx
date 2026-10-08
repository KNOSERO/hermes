import Link from "next/link";

export default function Dashboard() {
  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">HERMES LOCAL CONTROL</p>
          <h1>Panel zadań</h1>
          <p className="intro">
            Uruchamiaj operacje na dowolnej zapisanej konfiguracji i śledź ich logi.
          </p>
        </div>
      </section>

      <section className="panel dashboard-start">
        <span className="dashboard-start-mark" aria-hidden="true">▶</span>
        <div>
          <p className="section-kicker">GOTOWY DO PRACY</p>
          <h2>Co chcesz zrobić?</h2>
          <p className="help-text">
            Wybierz <strong>Nowe → Run job</strong>, aby wskazać operację i serwer.
            Konfiguracje oraz ostatnie joby znajdziesz w menu po lewej.
          </p>
          <Link className="text-button" href="/history">Otwórz pełną historię jobów →</Link>
        </div>
      </section>
    </>
  );
}
