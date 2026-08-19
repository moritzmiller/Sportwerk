// Generated from ../teilnahmebedingungen.jsx by scripts/build-jsx.js
function JobConsole({
  job
}) {
  const logs = job?.logs?.length ? job.logs.join("\n") : "Bereit";
  const progress = job?.state === "running" ? Math.max(job.progress || 0, 35) : job?.progress || 0;
  const stateLabels = {
    idle: "Bereit",
    queued: "Wartet",
    running: "Läuft",
    finished: "Fertig",
    failed: "Fehler"
  };
  const state = job?.state || "idle";
  return React.createElement("aside", {
    className: "panel panel--side document-console",
    "aria-live": "polite"
  }, React.createElement("div", {
    className: "panel__header"
  }, React.createElement("div", null, React.createElement("p", {
    className: "eyebrow"
  }, "Export"), React.createElement("h2", null, "Status")), React.createElement("span", {
    className: job?.state === "finished" ? "status-pill status-pill--active" : "status-pill"
  }, stateLabels[state] || state)), React.createElement("div", {
    className: "summary"
  }, React.createElement("div", null, React.createElement("span", null, job?.summary?.files?.length || 0), React.createElement("p", null, "Dateien")), React.createElement("div", null, React.createElement("span", null, job?.logs?.length || 0), React.createElement("p", null, "Logs"))), React.createElement("div", {
    className: "progress",
    "aria-label": "Fortschritt"
  }, React.createElement("div", {
    style: {
      width: `${progress}%`
    }
  })), React.createElement("p", {
    className: "status-text"
  }, job?.status_text || "Bereit"), job?.download_url && React.createElement("a", {
    className: "button button--download",
    href: job.download_url
  }, "ZIP herunterladen"), React.createElement("div", {
    className: "log"
  }, logs));
}
function SummaryPreview({
  job
}) {
  if (!job?.summary) {
    return null;
  }
  return React.createElement("section", {
    className: "panel document-preview",
    "aria-label": "Ergebnisvorschau"
  }, React.createElement("div", {
    className: "panel__header"
  }, React.createElement("div", null, React.createElement("p", {
    className: "eyebrow"
  }, "Ergebnis"), React.createElement("h2", null, "Vorschau"))), React.createElement("div", {
    className: "document-preview__grid"
  }, React.createElement("article", null, React.createElement("span", null, "Frage"), React.createElement("p", null, job.summary.question)), React.createElement("article", null, React.createElement("span", null, "Caption"), React.createElement("p", null, job.summary.caption))));
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
      window.setTimeout(() => poll(statusUrl).catch(err => setError(err.message)), 1200);
    }
  }
  async function submitForm(event) {
    event.preventDefault();
    setError("");
    setJob({
      state: "queued",
      status_text: "Job wird angelegt",
      progress: 4,
      logs: []
    });
    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/teilnahmebedingungen/jobs", {
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
  }, "Sportwerk"), React.createElement("h1", null, "Teilnahmebedingungen")), React.createElement("div", {
    className: "topbar__meta"
  }, React.createElement("a", {
    href: "/"
  }, "Dashboard"), React.createElement("span", null, "DOCX"), React.createElement("span", null, "Gewinnspiel"))), React.createElement("section", {
    className: "document-layout"
  }, React.createElement("div", {
    className: "document-main"
  }, React.createElement("section", {
    className: "dashboard-hero dashboard-hero--compact",
    "aria-label": "Teilnahmebedingungen Tool"
  }, React.createElement("div", null, React.createElement("p", {
    className: "dashboard-hero__label"
  }, "Dokumente"), React.createElement("h2", null, "Teilnahmebedingungen und Caption für Heimspiel-Gewinnspiele erstellen."))), React.createElement("form", {
    className: "panel participation-form",
    onSubmit: submitForm
  }, React.createElement("div", {
    className: "panel__header"
  }, React.createElement("div", null, React.createElement("p", {
    className: "eyebrow"
  }, "Eingabe"), React.createElement("h2", null, "Gewinnspiel")), React.createElement("button", {
    className: "button button--primary",
    type: "submit",
    disabled: running
  }, "Dokumente erstellen")), React.createElement("div", {
    className: "form-grid"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", null, "Verein"), React.createElement("input", {
    name: "club_name",
    type: "text",
    placeholder: "z. B. HC Leipzig",
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", null, "Gegner"), React.createElement("input", {
    name: "opponent",
    type: "text",
    placeholder: "z. B. HC Elbflorenz",
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", null, "Spieldatum"), React.createElement("input", {
    name: "game_day",
    type: "date",
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", null, "Texterstellung"), React.createElement("select", {
    name: "mode",
    defaultValue: "auto"
  }, React.createElement("option", {
    value: "auto"
  }, "Frage und Caption automatisch"), React.createElement("option", {
    value: "manual"
  }, "Eigene Texte verwenden"))), React.createElement("label", {
    className: "field field--full"
  }, React.createElement("span", null, "Eigene Gewinnspielfrage"), React.createElement("textarea", {
    name: "question",
    rows: "4",
    placeholder: "Leer lassen für automatische Erstellung"
  })), React.createElement("label", {
    className: "field field--full"
  }, React.createElement("span", null, "Eigene Caption"), React.createElement("textarea", {
    name: "caption",
    rows: "4",
    placeholder: "Leer lassen für automatische Erstellung"
  })))), error && React.createElement("p", {
    className: "notice notice--danger"
  }, error), React.createElement(SummaryPreview, {
    job: job
  })), React.createElement(JobConsole, {
    job: job
  })));
}
ReactDOM.createRoot(document.querySelector("#participation-root")).render(React.createElement(ParticipationTool, null));
