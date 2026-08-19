const actions = [
  {
    id: "mirror",
    title: "Boards spiegeln",
    eyebrow: "Synchronisation",
    tone: "orange",
    command: "Quellboards in das zentrale Zielboard schreiben",
    facts: ["Listen abgleichen", "Karten verknüpfen", "Labels setzen"],
  },
  {
    id: "summary",
    title: "KI-Aufgaben",
    eyebrow: "Auswertung",
    tone: "blue",
    command: "Mehrere Boards analysieren und einzelne Aufgabenkarten erstellen",
    facts: ["Board-Liste", "Einzelkarten", "Zielliste"],
  },
];

function ActionPanel({ action, running, onStart }) {
  return (
    <article className="action-panel">
      <div className="action-panel__head">
        <div className={`tool-card__mark tool-card__mark--${action.tone}`} aria-hidden="true">
          {action.id === "mirror" ? "SP" : "KI"}
        </div>
        <span className="status-pill">Bereit</span>
      </div>
      <div>
        <p className="tool-card__area">{action.eyebrow}</p>
        <h2>{action.title}</h2>
        <p>{action.command}</p>
      </div>
      <div className="tool-card__metrics">
        {action.facts.map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
      </div>
      <button className="button button--primary" type="button" disabled={running} onClick={() => onStart(action.id)}>
        Starten
      </button>
    </article>
  );
}

function JobConsole({ job }) {
  const logs = job?.logs?.length ? job.logs.join("\n") : "Bereit";
  const progress = job?.state === "running" ? 45 : job?.progress || 0;
  const stateLabels = {
    idle: "Bereit",
    queued: "Wartet",
    running: "Läuft",
    finished: "Fertig",
    failed: "Fehler",
  };
  const state = job?.state || "idle";

  return (
    <aside className="panel panel--side trello-console" aria-live="polite">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Job</p>
          <h2>Status</h2>
        </div>
        <span className={job?.state === "finished" ? "status-pill status-pill--active" : "status-pill"}>
          {stateLabels[state] || state}
        </span>
      </div>
      <div className="summary">
        <div>
          <span>{job?.label ? "1" : "0"}</span>
          <p>laufend</p>
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
      <div className="log">{logs}</div>
    </aside>
  );
}

function TrelloTool() {
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

  async function startAction(action) {
    setError("");
    setJob({
      state: "queued",
      label: actions.find((item) => item.id === action)?.title,
      status_text: "Job wird angelegt",
      progress: 4,
      logs: [],
    });

    try {
      const formData = new FormData();
      formData.append("action", action);
      const response = await fetch("/trello/jobs", {
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
          <h1>Trello Steuerung</h1>
        </div>
        <div className="topbar__meta">
          <a href="/">Dashboard</a>
          <span>Boards</span>
          <span>KI</span>
        </div>
      </header>

      <section className="trello-layout">
        <div className="trello-main">
          <section className="dashboard-hero dashboard-hero--compact" aria-label="Trello Tool">
            <div>
              <p className="dashboard-hero__label">Trello Workflows</p>
              <h2>Spiegelung und KI-Aufgaben zentral ausführen.</h2>
            </div>
          </section>

          <section className="action-grid" aria-label="Trello Aktionen">
            {actions.map((action) => (
              <ActionPanel key={action.id} action={action} running={running} onStart={startAction} />
            ))}
          </section>

          {error && <p className="notice notice--danger">{error}</p>}
        </div>

        <JobConsole job={job} />
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.querySelector("#trello-root")).render(<TrelloTool />);
