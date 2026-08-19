const sectionsEl = document.querySelector("#sections");
const template = document.querySelector("#section-template");
const addSectionButton = document.querySelector("#add-section");
const form = document.querySelector("#pressespiegel-form");
const layoutSelect = document.querySelector("#layout-select");
const layoutData = JSON.parse(document.querySelector("#layout-data").textContent);
const progressBar = document.querySelector("#progress-bar");
const statusText = document.querySelector("#status-text");
const logOutput = document.querySelector("#log-output");
const downloadLink = document.querySelector("#download-link");
const summarySections = document.querySelector("#summary-sections");
const summaryUrls = document.querySelector("#summary-urls");

function addSection(heading = "", urls = "") {
  const fragment = template.content.cloneNode(true);
  const item = fragment.querySelector(".section-item");
  item.querySelector("input[name='section_heading']").value = heading;
  item.querySelector("textarea[name='section_urls']").value = urls;
  item.querySelector(".remove-section").addEventListener("click", () => {
    item.remove();
    if (!sectionsEl.querySelector(".section-item")) {
      addSection();
    }
    updateSummary();
  });
  item.querySelectorAll("input, textarea").forEach((control) => {
    control.addEventListener("input", updateSummary);
  });
  sectionsEl.appendChild(fragment);
  updateSummary();
}

function getUrlCount(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function updateSummary() {
  const sectionItems = [...sectionsEl.querySelectorAll(".section-item")];
  const activeSections = sectionItems.filter((item) => {
    const heading = item.querySelector("input[name='section_heading']").value.trim();
    const urls = item.querySelector("textarea[name='section_urls']").value;
    return heading || getUrlCount(urls) > 0;
  });
  const urlCount = sectionItems.reduce((sum, item) => {
    return sum + getUrlCount(item.querySelector("textarea[name='section_urls']").value);
  }, 0);
  summarySections.textContent = activeSections.length || sectionItems.length;
  summaryUrls.textContent = urlCount;
}

function applyLayout(layoutId) {
  const layout = layoutData.find((candidate) => candidate.layout_id === layoutId);
  if (!layout) return;

  document.querySelector("#cover-style").value = layout.cover_style || "classic";
  document.querySelector("#title-text").value = layout.title_text || "PRESSESPIEGEL";
  document.querySelector("#font-family").value = layout.font_family || "Helvetica";
  document.querySelector("#background-kind").value = layout.background_kind || "color";
  document.querySelector("#background-hex").value = layout.background_hex || "#ffffff";
  document.querySelector("#background-image-path").value = layout.background_image_path || "";
  document.querySelector("#cover-image-path").value = layout.cover_image_path || "";
  document.querySelector("#accent-hex").value = layout.accent_hex || "#f28c28";
  document.querySelector("#main-logo-path").value = layout.main_logo_path || "";
}

function setBusy(isBusy) {
  form.querySelectorAll("button, input, select, textarea").forEach((control) => {
    control.disabled = isBusy;
  });
}

function setStatus(message, progress = null) {
  statusText.textContent = message;
  if (progress !== null) {
    progressBar.style.width = `${progress}%`;
  }
}

function renderLogs(job) {
  const inputErrors = job.input_errors?.length
    ? [`Hinweis: ${job.input_errors.length} ungültige Eingabe(n) wurden übersprungen.`, ...job.input_errors]
    : [];
  logOutput.textContent = [...inputErrors, ...(job.logs || [])].join("\n");
  logOutput.scrollTop = logOutput.scrollHeight;
}

async function pollJob(statusUrl) {
  const response = await fetch(statusUrl);
  const job = await response.json();
  if (!response.ok) {
    throw new Error(job.error || "Der Jobstatus konnte nicht gelesen werden.");
  }

  setStatus(job.status_text || "Verarbeitung läuft", job.progress || 0);
  renderLogs(job);

  if (job.state === "finished") {
    downloadLink.href = job.download_url;
    downloadLink.classList.remove("hidden");
    setBusy(false);
    return;
  }

  if (job.state === "failed" || job.state === "cancelled") {
    setBusy(false);
    return;
  }

  window.setTimeout(() => pollJob(statusUrl).catch(showError), 1200);
}

function showError(error) {
  setBusy(false);
  setStatus(error.message || "Ein Fehler ist aufgetreten", 100);
}

document.querySelectorAll(".file-picker input[type='file']").forEach((input) => {
  input.addEventListener("change", () => {
    const label = input.closest(".file-picker").querySelector("strong");
    label.textContent = input.files?.[0]?.name || "Keine Datei ausgewählt";
  });
});

addSectionButton.addEventListener("click", () => addSection());
layoutSelect.addEventListener("change", () => applyLayout(layoutSelect.value));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  downloadLink.classList.add("hidden");
  logOutput.textContent = "";
  const formData = new FormData(form);
  setBusy(true);
  setStatus("Job wird angelegt", 4);

  try {
    const response = await fetch("/jobs", {
      method: "POST",
      body: formData,
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Die Eingaben konnten nicht verarbeitet werden.");
    }
    setStatus("Verarbeitung startet", 8);
    pollJob(result.status_url).catch(showError);
  } catch (error) {
    showError(error);
  }
});

addSection("Regionale Presse", "");
applyLayout(layoutSelect.value);
