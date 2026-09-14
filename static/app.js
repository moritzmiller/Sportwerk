const sectionsEl = document.querySelector("#sections");
const template = document.querySelector("#section-template");
const addSectionButton = document.querySelector("#add-section");
const form = document.querySelector("#pressespiegel-form");
const layoutSelect = document.querySelector("#layout-select");
const layoutData = JSON.parse(document.querySelector("#layout-data").textContent);
const savedPressespiegelData = JSON.parse(document.querySelector("#saved-pressespiegel-data").textContent);
const progressBar = document.querySelector("#progress-bar");
const statusText = document.querySelector("#status-text");
const logOutput = document.querySelector("#log-output");
const downloadLink = document.querySelector("#download-link");
const summarySections = document.querySelector("#summary-sections");
const summaryUrls = document.querySelector("#summary-urls");
const fallbackUrls = document.querySelector("textarea[name='fallback_urls']");
const savedSelect = document.querySelector("#saved-pressespiegel-select");
const savedName = document.querySelector("#saved-pressespiegel-name");
const savedStatus = document.querySelector("#saved-pressespiegel-status");
const loadPressespiegelButton = document.querySelector("#load-pressespiegel");
const savePressespiegelButton = document.querySelector("#save-pressespiegel");
const deletePressespiegelButton = document.querySelector("#delete-pressespiegel");
let savedPressespiegel = Array.isArray(savedPressespiegelData) ? savedPressespiegelData : [];
let currentSavedPressespiegelId = "";
let displayedProgress = 0;

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
  const fallbackUrlCount = getUrlCount(fallbackUrls.value);
  summarySections.textContent = activeSections.length || sectionItems.length;
  summaryUrls.textContent = activeSections.length ? urlCount : fallbackUrlCount;
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

function setSavedStatus(message, tone = "neutral") {
  savedStatus.textContent = message;
  savedStatus.dataset.tone = tone;
}

function renderSavedPressespiegelOptions() {
  const selectedId = currentSavedPressespiegelId || savedSelect.value;
  savedSelect.innerHTML = '<option value="">Neuer Pressespiegel</option>';
  savedPressespiegel.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    savedSelect.appendChild(option);
  });
  savedSelect.value = savedPressespiegel.some((item) => item.id === selectedId) ? selectedId : "";
}

function findSavedPressespiegel(id) {
  return savedPressespiegel.find((item) => item.id === id);
}

function readLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function collectSections() {
  return [...sectionsEl.querySelectorAll(".section-item")]
    .map((item) => {
      return {
        heading: item.querySelector("input[name='section_heading']").value.trim(),
        urls: readLines(item.querySelector("textarea[name='section_urls']").value),
      };
    })
    .filter((section) => section.heading || section.urls.length);
}

function collectLayoutState() {
  return {
    layout_id: document.querySelector("#layout-select").value,
    cover_style: document.querySelector("#cover-style").value,
    title_text: document.querySelector("#title-text").value,
    font_family: document.querySelector("#font-family").value,
    background_kind: document.querySelector("#background-kind").value,
    background_hex: document.querySelector("#background-hex").value,
    background_image_path: document.querySelector("#background-image-path").value,
    cover_image_path: document.querySelector("#cover-image-path").value,
    accent_hex: document.querySelector("#accent-hex").value,
    main_logo_path: document.querySelector("#main-logo-path").value,
  };
}

function collectPressespiegelPayload() {
  return {
    id: currentSavedPressespiegelId,
    name: savedName.value.trim(),
    sections: collectSections(),
    fallback_urls: readLines(fallbackUrls.value),
    layout: collectLayoutState(),
  };
}

function setControlValue(selector, value) {
  const control = document.querySelector(selector);
  if (control && value !== undefined && value !== null) {
    control.value = value;
  }
}

function applySavedLayout(layout) {
  if (!layout || typeof layout !== "object") {
    return;
  }
  if (layout.layout_id && layoutData.some((candidate) => candidate.layout_id === layout.layout_id)) {
    setControlValue("#layout-select", layout.layout_id);
  }
  setControlValue("#cover-style", layout.cover_style);
  setControlValue("#title-text", layout.title_text);
  setControlValue("#font-family", layout.font_family);
  setControlValue("#background-kind", layout.background_kind);
  setControlValue("#background-hex", layout.background_hex);
  setControlValue("#background-image-path", layout.background_image_path);
  setControlValue("#cover-image-path", layout.cover_image_path);
  setControlValue("#accent-hex", layout.accent_hex);
  setControlValue("#main-logo-path", layout.main_logo_path);
}

function applySavedPressespiegel(item) {
  currentSavedPressespiegelId = item.id || "";
  savedSelect.value = currentSavedPressespiegelId;
  savedName.value = item.name || "";
  sectionsEl.innerHTML = "";
  if (Array.isArray(item.sections) && item.sections.length) {
    item.sections.forEach((section) => {
      addSection(section.heading || "", (section.urls || []).join("\n"));
    });
  } else {
    addSection("Regionale Presse", "");
  }
  fallbackUrls.value = (item.fallback_urls || []).join("\n");
  applySavedLayout(item.layout);
  updateSummary();
  setSavedStatus("Pressespiegel geladen.", "success");
}

function setBusy(isBusy) {
  form.querySelectorAll("button, input, select, textarea").forEach((control) => {
    control.disabled = isBusy;
  });
}

function setStatus(message, progress = null) {
  statusText.textContent = message;
  if (progress !== null) {
    displayedProgress = Math.max(displayedProgress, Number(progress) || 0);
    progressBar.style.width = `${displayedProgress}%`;
  }
}

function renderLogs(job) {
  const inputErrors = job.input_errors?.length
    ? [`Hinweis: ${job.input_errors.length} ungültige Eingabe(n) wurden übersprungen.`, ...job.input_errors]
    : [];
  logOutput.textContent = [...inputErrors, ...(job.logs || [])].join("\n");
  logOutput.scrollTop = logOutput.scrollHeight;
}

async function saveCurrentPressespiegel() {
  const payload = collectPressespiegelPayload();
  if (!payload.name) {
    setSavedStatus("Bitte einen Namen eingeben.", "danger");
    savedName.focus();
    return;
  }
  setSavedStatus("Speichern läuft ...");

  try {
    const response = await fetch("/pressespiegel/saved", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Pressespiegel konnte nicht gespeichert werden.");
    }

    savedPressespiegel = savedPressespiegel.filter((item) => item.id !== result.item.id);
    savedPressespiegel.unshift(result.item);
    currentSavedPressespiegelId = result.item.id;
    renderSavedPressespiegelOptions();
    setSavedStatus("Pressespiegel gespeichert.", "success");
  } catch (error) {
    setSavedStatus(error.message || "Pressespiegel konnte nicht gespeichert werden.", "danger");
  }
}

async function loadSelectedPressespiegel() {
  const selected = findSavedPressespiegel(savedSelect.value);
  if (!selected) {
    currentSavedPressespiegelId = "";
    savedName.value = "";
    setSavedStatus("Neuer Pressespiegel.");
    return;
  }
  applySavedPressespiegel(selected);
}

async function deleteSelectedPressespiegel() {
  const selected = findSavedPressespiegel(savedSelect.value);
  if (!selected) {
    setSavedStatus("Kein gespeicherter Pressespiegel ausgewählt.", "danger");
    return;
  }

  try {
    const response = await fetch(`/pressespiegel/saved/${encodeURIComponent(selected.id)}`, {
      method: "DELETE",
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Pressespiegel konnte nicht gelöscht werden.");
    }
    savedPressespiegel = savedPressespiegel.filter((item) => item.id !== selected.id);
    currentSavedPressespiegelId = "";
    renderSavedPressespiegelOptions();
    savedName.value = "";
    setSavedStatus("Pressespiegel gelöscht.", "success");
  } catch (error) {
    setSavedStatus(error.message || "Pressespiegel konnte nicht gelöscht werden.", "danger");
  }
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
    if (input.name === "source_logos") {
      const files = [...(input.files || [])].filter((file) => file.name.toLowerCase().endsWith(".png"));
      const firstPath = files[0]?.webkitRelativePath || "";
      const folderName = firstPath.split("/")[0] || "";
      label.textContent = files.length
        ? `${folderName || "Logo-Ordner"} (${files.length} PNG)`
        : "Kein Ordner ausgewählt";
      return;
    }
    label.textContent = input.files?.[0]?.name || "Keine Datei ausgewählt";
  });
});

addSectionButton.addEventListener("click", () => addSection());
layoutSelect.addEventListener("change", () => applyLayout(layoutSelect.value));
fallbackUrls.addEventListener("input", updateSummary);
savedSelect.addEventListener("change", loadSelectedPressespiegel);
loadPressespiegelButton.addEventListener("click", loadSelectedPressespiegel);
savePressespiegelButton.addEventListener("click", saveCurrentPressespiegel);
deletePressespiegelButton.addEventListener("click", deleteSelectedPressespiegel);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  displayedProgress = 0;
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
renderSavedPressespiegelOptions();
