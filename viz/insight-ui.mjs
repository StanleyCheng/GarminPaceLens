import { message as msg, setText, setLabel, number, monthNames, getLanguage, onLanguageChange, plotLocale } from "./i18n.mjs";
import { INSIGHTS, buildInsight, formatPace, prepareActivities } from "./insights.mjs";

const byId = (id) => document.getElementById(id);

export function createInsightDashboard() {
  const state = { year: null, startMonth: 1, endMonth: 12, activityType: "run",
    distanceBucket: "all", insight: "volume", weeklyUnit: "distance", bestDistance: "5" };
  let activities = [];
  let originalCount = 0;
  const chart = byId("chart");
  const rail = byId("insight-rail");
  const tooltip = byId("insight-tooltip");
  const tabs = [...rail.querySelectorAll(".insight-tab")];

  function populateSelects() {
    const years = [...new Set(activities.map((activity) => activity.year))].sort((a, b) => a - b);
    if (!years.length) years.push(new Date().getFullYear());
    const yearSelect = byId("year-select");
    const previous = Number(state.year);
    yearSelect.replaceChildren();
    for (const year of years) yearSelect.add(new Option(String(year), String(year)));
    state.year = years.includes(previous) ? previous : years.at(-1);
    yearSelect.value = String(state.year);
    for (const id of ["start-month-select", "end-month-select"]) {
      const select = byId(id);
      select.replaceChildren();
      monthNames("short").forEach((month, index) => select.add(new Option(month, String(index + 1))));
    }
    byId("start-month-select").value = String(state.startMonth);
    byId("end-month-select").value = String(state.endMonth);
  }

  function renderTable(rows) {
    const body = byId("month-table-body");
    body.replaceChildren();
    for (const row of rows) {
      const tr = document.createElement("tr");
      if (!row.selected) tr.className = "outside-range";
      const values = [row.name, row.selected ? formatPace(row.pace) : "—",
        row.selected ? `${row.distance.toFixed(1)} km` : "—",
        row.selected ? String(row.count) : "—"];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value;
        tr.appendChild(cell);
      }
      body.appendChild(tr);
    }
  }

  function renderCleanedSummary() {
    const paces = activities.map((activity) => activity.pace_s_per_km)
      .filter((value) => typeof value === "number" && Number.isFinite(value) && value >= 180 && value <= 1200);
    setText(byId("original-activities"), number(originalCount));
    setText(byId("cleaned-activities"), number(activities.length));
    setText(byId("excluded-activities"), number(Math.max(0, originalCount - activities.length)));
    setText(byId("min-cleaned-pace"), paces.length ? `${formatPace(Math.min(...paces))} /km` : "—");
    setText(byId("max-cleaned-pace"), paces.length ? `${formatPace(Math.max(...paces))} /km` : "—");
  }

  function render() {
    if (!activities || state.year === null) return;
    const insight = INSIGHTS.find((item) => item.id === state.insight);
    const result = buildInsight(activities, state, { narrow: window.innerWidth <= 720 });
    setText(byId("chart-title"), insight.title);
    setText(byId("insight-description"), insight.description);
    setText(byId("chart-unit"), state.insight === "volume"
      ? (state.weeklyUnit === "hours" ? "Hours per week" : "Kilometres per week") : "");
    setText(byId("chart-note"), result.note);
    setLabel(byId("chart"), "aria-label", msg("{title}. {note} Monthly figures are in the table below.", { title: msg(insight.title), note: result.note }));
    setText(byId("table-year"), String(state.year));
    byId("weekly-unit-field").hidden = state.insight !== "volume";
    byId("best-distance-field").hidden = state.insight !== "best";
    setText(byId("average-pace"), formatPace(result.summary.averagePace));
    setText(byId("total-distance"), `${result.summary.totalDistance.toFixed(1)} km`);
    setText(byId("activities-included"), number(result.summary.activityCount));
    setText(byId("active-days"), number(result.summary.activeDays));
    renderTable(result.rows);
    tabs.forEach((tab) => tab.setAttribute("aria-pressed", String(tab.dataset.insight === state.insight)));
    chart.style.minWidth = result.minWidth ? `${result.minWidth}px` : "";
    chart.style.height = ["compare", "endurance", "climbing"].includes(state.insight)
      ? (window.innerWidth <= 720 ? "500px" : "520px") : "";
    if (typeof Plotly === "undefined") {
      setText(chart, "The chart could not load. The monthly table below remains available.");
      return;
    }
    const { insight: revisionInsight, ...filters } = state;
    result.layout.uirevision = JSON.stringify([revisionInsight, filters]);
    Plotly.react(chart, result.traces, result.layout, { locale: getLanguage() === "en" ? "en-US" : "zh-HK", responsive: true,
      displayModeBar: false, displaylogo: false, scrollZoom: false });
  }

  function hideTooltip() { tooltip.hidden = true; }

  function showTooltip(tab) {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      hideTooltip();
      return;
    }
    setText(tooltip, tab.dataset.tooltip);
    const bounds = tab.getBoundingClientRect();
    tooltip.style.left = `${Math.max(12, Math.min(window.innerWidth - 280, bounds.left))}px`;
    tooltip.style.top = `${bounds.bottom + 8}px`;
    tooltip.hidden = false;
  }

  function updateArrows() {
    byId("rail-prev").disabled = rail.scrollLeft <= 2;
    byId("rail-next").disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;
  }

  function init() {
    if (typeof Plotly !== "undefined") Plotly.register(plotLocale());
    onLanguageChange(() => {
      hideTooltip();
      if (state.year !== null) { populateSelects(); renderCleanedSummary(); }
      if (!byId("dashboard-content").hidden) { render(); updateArrows(); }
    });
    byId("year-select").addEventListener("change", (event) => {
      state.year = Number(event.target.value); render();
    });
    byId("start-month-select").addEventListener("change", (event) => {
      state.startMonth = Number(event.target.value);
      if (state.startMonth > state.endMonth) {
        state.endMonth = state.startMonth;
        byId("end-month-select").value = String(state.endMonth);
      }
      render();
    });
    byId("end-month-select").addEventListener("change", (event) => {
      state.endMonth = Number(event.target.value);
      if (state.endMonth < state.startMonth) {
        state.startMonth = state.endMonth;
        byId("start-month-select").value = String(state.startMonth);
      }
      render();
    });
    for (const [id, key] of [["activity-type", "activityType"], ["distance-bucket", "distanceBucket"],
      ["weekly-unit", "weeklyUnit"], ["best-distance", "bestDistance"]]) {
      byId(id).addEventListener("change", (event) => { state[key] = event.target.value; render(); });
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => {
        state.insight = tab.dataset.insight;
        byId("chart-viewport").scrollLeft = 0;
        hideTooltip();
        render();
        tab.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      });
      tab.addEventListener("pointerenter", () => showTooltip(tab));
      tab.addEventListener("pointerleave", hideTooltip);
      tab.addEventListener("focus", () => showTooltip(tab));
      tab.addEventListener("blur", hideTooltip);
      tab.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const next = tabs[index + (event.key === "ArrowRight" ? 1 : -1)];
        if (next) { next.focus(); next.click(); }
      });
    });
    byId("rail-prev").addEventListener("click", () => rail.scrollBy({ left: -300, behavior: "smooth" }));
    byId("rail-next").addEventListener("click", () => rail.scrollBy({ left: 300, behavior: "smooth" }));
    rail.addEventListener("scroll", () => {
      updateArrows();
      const hovered = rail.querySelector(".insight-tab:hover");
      if (hovered) showTooltip(hovered);
      else hideTooltip();
    }, { passive: true });
    window.addEventListener("resize", () => { hideTooltip(); updateArrows(); render(); });
    updateArrows();
  }

  function applyPayload(payload) {
    activities = prepareActivities(payload.activities);
    const dropped = Object.values(payload.meta?.activity_count_dropped || {})
      .filter(Number.isFinite).reduce((total, count) => total + count, 0);
    originalCount = Number.isInteger(payload.meta?.activity_count_fetched)
      ? payload.meta.activity_count_fetched : payload.activities.length + dropped;
    populateSelects();
    renderCleanedSummary();
    return { activities, originalCount };
  }

  function clear() {
    activities = [];
    originalCount = 0;
    state.year = null;
    state.startMonth = 1;
    state.endMonth = 12;
    state.activityType = "run";
    state.distanceBucket = "all";
    state.insight = "volume";
    state.weeklyUnit = "distance";
    state.bestDistance = "5";
    byId("activity-type").value = "run";
    byId("distance-bucket").value = "all";
    byId("weekly-unit").value = "distance";
    byId("best-distance").value = "5";
    hideTooltip();
    if (typeof Plotly !== "undefined") Plotly.purge(chart);
    chart.replaceChildren();
    byId("month-table-body").replaceChildren();
  }

  return { init, applyPayload, render, clear, state };
}
