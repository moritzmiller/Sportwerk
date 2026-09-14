function JobConsole({ job }) {
  const logs = job?.logs?.length ? job.logs.join("\n") : "Bereit";
  const progress = job?.state === "running" ? Math.max(job.progress || 0, 35) : job?.progress || 0;
  const stateLabels = {
    idle: "Bereit",
    queued: "Wartet",
    running: "Läuft",
    finished: "Fertig",
    failed: "Fehler",
  };
  const state = job?.state || "idle";

  return (
    <aside className="panel panel--side document-console" aria-live="polite">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Export</p>
          <h2>Status</h2>
        </div>
        <span className={job?.state === "finished" ? "status-pill status-pill--active" : "status-pill"}>
          {stateLabels[state] || state}
        </span>
      </div>
      <div className="summary">
        <div>
          <span>{job?.summary?.files?.length || 0}</span>
          <p>Dateien</p>
        </div>
        <div>
          <span>{job?.logs?.length || 0}</span>
          <p>Logs</p>
        </div>
      </div>
      <div className="progress" aria-label="Fortschritt">
        <div style={{ width: `${progress}%` }} />
      </div>
      <p className="status-text">{job?.status_text || "Bereit"}</p>
      {job?.download_url && (
        <a className="button button--download" href={job.download_url}>
          ZIP herunterladen
        </a>
      )}
      <div className="log">{logs}</div>
    </aside>
  );
}

function SummaryPreview({ job }) {
  if (!job?.summary) {
    return null;
  }

  return (
    <section className="panel document-preview" aria-label="Ergebnisvorschau">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Ergebnis</p>
          <h2>Vorschau</h2>
        </div>
      </div>
      <div className="document-preview__grid">
        <article>
          <span>Frage</span>
          <p>{job.summary.question}</p>
        </article>
        <article>
          <span>Caption</span>
          <p>{job.summary.caption}</p>
        </article>
      </div>
    </section>
  );
}

function ParticipationTool() {
  const [job, setJob] = React.useState(null);
  const [error, setError] = React.useState("");
  const running = job?.state === "queued" || job?.state === "running";

  async function poll(statusUrl) {
    const response = await fetch(statusUrl);
    const nextJob = await response.json();
    if (!response.ok) {
      throw new Error(nextJob.error || "Jobstatus konnte nicht gelesen werden.");
    }

    setJob(nextJob);
    if (nextJob.state === "queued" || nextJob.state === "running") {
      window.setTimeout(() => poll(statusUrl).catch((err) => setError(err.message)), 1200);
    }
  }

  async function submitForm(event) {
    event.preventDefault();
    setError("");
    setJob({
      state: "queued",
      status_text: "Job wird angelegt",
      progress: 4,
      logs: [],
    });

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/teilnahmebedingungen/jobs", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Job konnte nicht gestartet werden.");
      }
      poll(result.status_url).catch((err) => setError(err.message));
    } catch (err) {
      setError(err.message || "Ein Fehler ist aufgetreten.");
      setJob((current) => ({ ...(current || {}), state: "failed", status_text: err.message, progress: 100 }));
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Sportwerk</p>
          <h1>Teilnahmebedingungen</h1>
        </div>
        <div className="topbar__meta">
          <a href="/">Dashboard</a>
          <span>DOCX</span>
          <span>Gewinnspiel</span>
        </div>
      </header>

      <section className="document-layout">
        <div className="document-main">
          <section className="dashboard-hero dashboard-hero--compact" aria-label="Teilnahmebedingungen Tool">
            <div>
              <p className="dashboard-hero__label">Dokumente</p>
              <h2>Teilnahmebedingungen und Caption für Heimspiel-Gewinnspiele erstellen.</h2>
            </div>
          </section>

          <form className="panel participation-form" onSubmit={submitForm}>
            <div className="panel__header">
              <div>
                <p className="eyebrow">Eingabe</p>
                <h2>Gewinnspiel</h2>
              </div>
              <button className="button button--primary" type="submit" disabled={running}>
                Dokumente erstellen
              </button>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Verein</span>
                <input name="club_name" type="text" placeholder="z. B. HC Leipzig" required />
              </label>
              <label className="field">
                <span>Gegner</span>
                <input name="opponent" type="text" placeholder="z. B. HC Elbflorenz" required />
              </label>
              <label className="field">
                <span>Spieldatum</span>
                <input name="game_day" type="date" required />
              </label>
              <label className="field">
                <span>Texterstellung</span>
                <select name="mode" defaultValue="auto">
                  <option value="auto">Frage und Caption automatisch</option>
                  <option value="manual">Eigene Texte verwenden</option>
                </select>
              </label>
              <label className="field field--full">
                <span>Eigene Gewinnspielfrage</span>
                <textarea name="question" rows="4" placeholder="Leer lassen für automatische Erstellung"></textarea>
              </label>
              <label className="field field--full">
                <span>Eigene Caption</span>
                <textarea name="caption" rows="4" placeholder="Leer lassen für automatische Erstellung"></textarea>
              </label>
            </div>
          </form>

          {error && <p className="notice notice--danger">{error}</p>}
          <SummaryPreview job={job} />
        </div>

        <JobConsole job={job} />
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.querySelector("#participation-root")).render(<ParticipationTool />);
