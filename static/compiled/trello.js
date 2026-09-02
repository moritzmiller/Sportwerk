// Generated from ../trello.jsx by scripts/build-jsx.js
const actions = [{
  id: "mirror",
  title: "Boards spiegeln",
  eyebrow: "Synchronisation",
  tone: "orange",
  command: "Quellboards in das zentrale Zielboard schreiben",
  facts: ["Listen abgleichen", "Karten verknüpfen", "Labels setzen"]
}, {
  id: "summary",
  title: "KI-Aufgaben",
  eyebrow: "Auswertung",
  tone: "blue",
  command: "Mehrere Boards analysieren und einzelne Aufgabenkarten erstellen",
  facts: ["Board-Liste", "Einzelkarten", "Zielliste"]
}, {
  id: "assigned",
  title: "Meine Karten",
  eyebrow: "Zuweisungen",
  tone: "green",
  command: "Dir zugewiesene Karten nach KW, Overdue und Quellboard einsortieren",
  facts: ["Diese Woche", "over due", "Quellboard"]
}];
function ActionPanel({
  action,
  running,
  onStart
}) {
  return React.createElement("article", {
    className: "action-panel"
  }, React.createElement("div", {
    className: "action-panel__head"
  }, React.createElement("div", {
    className: `tool-card__mark tool-card__mark--${action.tone}`,
    "aria-hidden": "true"
  }, action.id === "mirror" ? "SP" : action.id === "summary" ? "KI" : "ME"), React.createElement("span", {
    className: "status-pill"
  }, "Bereit")), React.createElement("div", null, React.createElement("p", {
    className: "tool-card__area"
  }, action.eyebrow), React.createElement("h2", null, action.title), React.createElement("p", null, action.command)), React.createElement("div", {
    className: "tool-card__metrics"
  }, action.facts.map(fact => React.createElement("span", {
    key: fact
  }, fact))), React.createElement("button", {
    className: "button button--primary",
    type: "button",
    disabled: running,
    onClick: () => onStart(action.id)
  }, "Starten"));
}
function JobConsole({
  job
}) {
  const logs = job?.logs?.length ? job.logs.join("\n") : "Bereit";
  const progress = job?.state === "running" ? 45 : job?.progress || 0;
  const stateLabels = {
    idle: "Bereit",
    queued: "Wartet",
    running: "Läuft",
    finished: "Fertig",
    failed: "Fehler"
  };
  const state = job?.state || "idle";
  return React.createElement("aside", {
    className: "panel panel--side trello-console",
    "aria-live": "polite"
  }, React.createElement("div", {
    className: "panel__header"
  }, React.createElement("div", null, React.createElement("p", {
    className: "eyebrow"
  }, "Job"), React.createElement("h2", null, "Status")), React.createElement("span", {
    className: job?.state === "finished" ? "status-pill status-pill--active" : "status-pill"
  }, stateLabels[state] || state)), React.createElement("div", {
    className: "summary"
  }, React.createElement("div", null, React.createElement("span", null, job?.label ? "1" : "0"), React.createElement("p", null, "laufend")), React.createElement("div", null, React.createElement("span", null, job?.logs?.length || 0), React.createElement("p", null, "Logs"))), React.createElement("div", {
    className: "progress",
    "aria-label": "Fortschritt"
  }, React.createElement("div", {
    style: {
      width: `${progress}%`
    }
  })), React.createElement("p", {
    className: "status-text"
  }, job?.status_text || "Bereit"), React.createElement("div", {
    className: "log"
  }, logs));
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
      window.setTimeout(() => poll(statusUrl).catch(err => setError(err.message)), 1200);
    }
  }
  async function startAction(action) {
    setError("");
    setJob({
      state: "queued",
      label: actions.find(item => item.id === action)?.title,
      status_text: "Job wird angelegt",
      progress: 4,
      logs: []
    });
    try {
      const formData = new FormData();
      formData.append("action", action);
      const response = await fetch("/trello/jobs", {
        method: "POST",
        body: formData
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Job konnte nicht gestartet werden.");
      }
      poll(result.status_url).catch(err => setError(err.message));
    } catch (err) {
      setError(err.message || "Ein Fehler ist aufgetreten.");
      setJob(current => ({
        ...(current || {}),
        state: "failed",
        status_text: err.message,
        progress: 100
      }));
    }
  }
  return React.createElement("main", {
    className: "app-shell"
  }, React.createElement("header", {
    className: "topbar"
  }, React.createElement("div", null, React.createElement("p", {
    className: "eyebrow"
  }, "Sportwerk"), React.createElement("h1", null, "Trello Steuerung")), React.createElement("div", {
    className: "topbar__meta"
  }, React.createElement("a", {
    href: "/"
  }, "Dashboard"), React.createElement("span", null, "Boards"), React.createElement("span", null, "KI"))), React.createElement("section", {
    className: "trello-layout"
  }, React.createElement("div", {
    className: "trello-main"
  }, React.createElement("section", {
    className: "dashboard-hero dashboard-hero--compact",
    "aria-label": "Trello Tool"
  }, React.createElement("div", null, React.createElement("p", {
    className: "dashboard-hero__label"
  }, "Trello Workflows"), React.createElement("h2", null, "Spiegelung und KI-Aufgaben zentral ausführen."))), React.createElement("section", {
    className: "action-grid",
    "aria-label": "Trello Aktionen"
  }, actions.map(action => React.createElement(ActionPanel, {
    key: action.id,
    action: action,
    running: running,
    onStart: startAction
  }))), error && React.createElement("p", {
    className: "notice notice--danger"
  }, error)), React.createElement(JobConsole, {
    job: job
  })));
}
ReactDOM.createRoot(document.querySelector("#trello-root")).render(React.createElement(TrelloTool, null));
