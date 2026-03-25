import { generateDefaultSchedule, defaultRowsToCsv } from "./defaultScheduler.js";
import { generateTimeSchedule, timeRowsToCsv } from "./timeScheduler.js";

const appState = {
  default: {
    rows: [],
    airportCode: ""
  },
  time: {
    rows: [],
    airportCode: ""
  }
};

const STAND_TAG_GPT_URL = "https://chatgpt.com/g/g-69c0a72644508191b5259a40448479e1-atc-ground-point-schedule-stand-tag-applier";
const STAND_TAG_MODAL_PREFERENCE_KEY = "atcgp_hide_stand_tag_modal";

document.addEventListener("DOMContentLoaded", () => {
  setupDateLimits();

  document.getElementById("defaultScheduleForm")?.addEventListener("submit", handleDefaultSubmit);
  document.getElementById("timeScheduleForm")?.addEventListener("submit", handleTimeSubmit);

  document.getElementById("defaultDownloadCsvBtn")?.addEventListener("click", () => {
    downloadCsv("default");
  });

  document.getElementById("timeDownloadCsvBtn")?.addEventListener("click", () => {
    downloadCsv("time");
  });

  document.getElementById("timeStartDate")?.addEventListener("change", syncTimeDateLimits);
  document.getElementById("timeEndDate")?.addEventListener("change", syncTimeDateLimits);

  document.getElementById("standTagModalClose")?.addEventListener("click", closeStandTagModal);
  document.getElementById("standTagModalLater")?.addEventListener("click", closeStandTagModal);
  document.getElementById("standTagModal")?.addEventListener("click", (event) => {
    if (event.target.id === "standTagModal") {
      closeStandTagModal();
    }
  });
  document.getElementById("standTagDontShowAgain")?.addEventListener("change", saveStandTagModalPreference);
});

async function handleDefaultSubmit(event) {
  event.preventDefault();

  clearSectionMessages("default");
  clearPreview("default");
  setLoading("default", true);

  const apiKey = getValue("defaultApiKey");
  const airportCode = getValue("defaultAirportCode");
  const endDateRaw = getValue("defaultEndDate");

  try {
    const result = await generateDefaultSchedule({
      apiKey,
      airportCode,
      endDateRaw,
      onStatus: (message) => updateStatus("default", message),
      onLog: (message) => appendLog("default", message)
    });

    appState.default.rows = result.rows;
    appState.default.airportCode = result.airportCode;

    renderDefaultPreview(result.rows);
    showSuccess("default", `Generated ${result.rows.length} default schedule rows successfully.`);
    setDownloadEnabled("default", true);
  } catch (error) {
    showError("default", error.message || "Something went wrong.");
  } finally {
    setLoading("default", false);
    updateStatus("default", "");
  }
}

async function handleTimeSubmit(event) {
  event.preventDefault();

  clearSectionMessages("time");
  clearPreview("time");
  setLoading("time", true);

  const apiKey = getValue("timeApiKey");
  const airportCode = getValue("timeAirportCode");
  const startDateRaw = getValue("timeStartDate");
  const endDateRaw = getValue("timeEndDate");

  try {
    const result = await generateTimeSchedule({
      apiKey,
      airportCode,
      startDateRaw,
      endDateRaw,
      onStatus: (message) => updateStatus("time", message),
      onLog: (message) => appendLog("time", message)
    });

    appState.time.rows = result.rows;
    appState.time.airportCode = result.airportCode;

    renderTimePreview(result.rows);
    showSuccess("time", `Generated ${result.rows.length} timed schedule rows successfully.`);
    setDownloadEnabled("time", true);
  } catch (error) {
    showError("time", error.message || "Something went wrong.");
  } finally {
    setLoading("time", false);
    updateStatus("time", "");
  }
}

function setupDateLimits() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const yesterdayStr = formatDateForInput(yesterday);

  const defaultEndDate = document.getElementById("defaultEndDate");
  const timeStartDate = document.getElementById("timeStartDate");
  const timeEndDate = document.getElementById("timeEndDate");

  if (defaultEndDate) {
    defaultEndDate.max = yesterdayStr;
  }

  if (timeStartDate) {
    timeStartDate.max = yesterdayStr;
  }

  if (timeEndDate) {
    timeEndDate.max = yesterdayStr;
  }

  syncTimeDateLimits();
}

function syncTimeDateLimits() {
  const timeStartDate = document.getElementById("timeStartDate");
  const timeEndDate = document.getElementById("timeEndDate");

  if (!timeStartDate || !timeEndDate) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDateForInput(yesterday);

  timeStartDate.max = yesterdayStr;
  timeEndDate.max = yesterdayStr;

  if (timeStartDate.value) {
    const start = parseDateInputValue(timeStartDate.value);

    const maxEnd = new Date(start);
    maxEnd.setDate(maxEnd.getDate() + 6);

    const effectiveMaxEnd = maxEnd < yesterday ? maxEnd : yesterday;

    timeEndDate.min = timeStartDate.value;
    timeEndDate.max = formatDateForInput(effectiveMaxEnd);

    if (timeEndDate.value) {
      const end = parseDateInputValue(timeEndDate.value);

      if (end < start) {
        timeEndDate.value = timeStartDate.value;
      } else if (end > effectiveMaxEnd) {
        timeEndDate.value = formatDateForInput(effectiveMaxEnd);
      }
    }
  } else {
    timeEndDate.min = "";
    timeEndDate.max = yesterdayStr;
  }

  if (timeEndDate.value) {
    const end = parseDateInputValue(timeEndDate.value);

    const minStart = new Date(end);
    minStart.setDate(minStart.getDate() - 6);

    timeStartDate.min = formatDateForInput(minStart);

    if (timeStartDate.value) {
      const start = parseDateInputValue(timeStartDate.value);

      if (start > end) {
        timeStartDate.value = timeEndDate.value;
      } else {
        const maxAllowedEnd = new Date(start);
        maxAllowedEnd.setDate(maxAllowedEnd.getDate() + 6);

        if (end > maxAllowedEnd) {
          timeEndDate.value = formatDateForInput(maxAllowedEnd);
        }
      }
    }
  } else if (!timeStartDate.value) {
    timeStartDate.min = "";
  }
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function shouldShowStandTagModal() {
  return localStorage.getItem(STAND_TAG_MODAL_PREFERENCE_KEY) !== "true";
}

function saveStandTagModalPreference() {
  const checkbox = document.getElementById("standTagDontShowAgain");
  if (!checkbox) return;

  if (checkbox.checked) {
    localStorage.setItem(STAND_TAG_MODAL_PREFERENCE_KEY, "true");
  } else {
    localStorage.removeItem(STAND_TAG_MODAL_PREFERENCE_KEY);
  }
}

function openStandTagModal() {
  if (!shouldShowStandTagModal()) return;

  const modal = document.getElementById("standTagModal");
  const checkbox = document.getElementById("standTagDontShowAgain");

  if (!modal) return;

  if (checkbox) {
    checkbox.checked = localStorage.getItem(STAND_TAG_MODAL_PREFERENCE_KEY) === "true";
  }

  modal.hidden = false;
}

function closeStandTagModal() {
  saveStandTagModalPreference();

  const modal = document.getElementById("standTagModal");
  if (!modal) return;
  modal.hidden = true;
}

function downloadCsv(type) {
  const sectionState = appState[type];

  if (!sectionState.rows.length) {
    showError(type, "No CSV data available to download.");
    return;
  }

  const csvContent =
    type === "default"
      ? defaultRowsToCsv(sectionState.rows)
      : timeRowsToCsv(sectionState.rows);

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download =
    type === "default"
      ? `${sectionState.airportCode}_default_schedule.csv`
      : `${sectionState.airportCode}_time_schedule.csv`;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);

  openStandTagModal();
}

function renderDefaultPreview(rows) {
  const tbody = document.getElementById("defaultPreviewTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  for (const row of rows.slice(0, 100)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.Airline)}</td>
      <td>${escapeHtml(row.Airport)}</td>
      <td>${escapeHtml(row["Airplane Models"])}</td>
      <td>${escapeHtml(row["Stand Tags"])}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderTimePreview(rows) {
  const tbody = document.getElementById("timePreviewTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  for (const row of rows.slice(0, 100)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.Time)}</td>
      <td>${escapeHtml(row.Callsign)}</td>
      <td>${escapeHtml(row["Departure Airport"])}</td>
      <td>${escapeHtml(row["Arrival Airport"])}</td>
      <td>${escapeHtml(row["Airplane Model"])}</td>
      <td>${escapeHtml(row["Stand Tags"])}</td>
    `;
    tbody.appendChild(tr);
  }
}

function clearPreview(type) {
  const tbodyId =
    type === "default" ? "defaultPreviewTableBody" : "timePreviewTableBody";

  const tbody = document.getElementById(tbodyId);
  if (tbody) {
    tbody.innerHTML = "";
  }

  appState[type].rows = [];
  appState[type].airportCode = "";
  setDownloadEnabled(type, false);
}

function setLoading(type, isLoading) {
  const buttonId = type === "default" ? "defaultGenerateBtn" : "timeGenerateBtn";
  const button = document.getElementById(buttonId);
  if (!button) return;

  button.disabled = isLoading;
  button.textContent = isLoading ? "Generating..." : "Generate Schedule";
}

function setDownloadEnabled(type, enabled) {
  const buttonId = type === "default" ? "defaultDownloadCsvBtn" : "timeDownloadCsvBtn";
  const button = document.getElementById(buttonId);
  if (!button) return;

  button.disabled = !enabled;
}

function clearSectionMessages(type) {
  updateStatus(type, "");
  setText(`${type}ErrorBox`, "");
  setText(`${type}SuccessBox`, "");
  setText(`${type}LogBox`, "");
}

function updateStatus(type, message) {
  setText(`${type}StatusText`, message);
}

function appendLog(type, message) {
  const el = document.getElementById(`${type}LogBox`);
  if (!el) return;
  el.textContent += `${message}\n`;
}

function showError(type, message) {
  setText(`${type}ErrorBox`, message);
}

function showSuccess(type, message) {
  setText(`${type}SuccessBox`, message);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

function getValue(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}