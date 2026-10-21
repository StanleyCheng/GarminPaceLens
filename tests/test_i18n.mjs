import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TRANSLATIONS, STORAGE_KEY, getLanguage, setLanguage, t, message,
  setText, setLabel, errorMessage, monthNames, weekdayNames, activityDate } from "../viz/i18n.mjs";
import { INSIGHTS, buildInsight, prepareActivities } from "../viz/insights.mjs";

test("every authored HTML label and accessible name has a Chinese translation", () => {
  const html = readFileSync(new URL("../viz/index.html", import.meta.url), "utf8");
  const strings = [...html.matchAll(/>([^<>]+)</g)].map((match) => match[1].trim());
  strings.push(...[...html.matchAll(/(?:aria-label|title|placeholder|data-tooltip)="([^"]+)"/g)].map((match) => match[1]));
  const unchanged = /^(Garmin Pace Lens|繁中|[\d–./+\s-]*km)$/;
  const missing = strings.filter((value) => /[A-Za-z]/.test(value) && !unchanged.test(value) && !Object.hasOwn(TRANSLATIONS, value));
  assert.deepEqual(missing, []);
});

test("translations preserve named fields and Plotly tokens", () => {
  const tokens = (value) => [...value.matchAll(/%?\{[^}]+\}/g)].map((match) => match[0]).sort();
  for (const [source, translated] of Object.entries(TRANSLATIONS)) {
    assert.deepEqual(tokens(translated), tokens(source), source);
    assert.match(translated, /[\u3400-\u9fff]/, source);
  }
  setLanguage("zh-HK");
  assert.equal(t("Week of %{x}<br>%{y:.1f} {unit}<br>%{customdata} activities<extra></extra>", { unit: "km" }),
    "%{x} 該週<br>%{y:.1f} km<br>%{customdata} 次活動<extra></extra>");
  setLanguage("en");
});

test("live bindings translate feedback without translating user data", () => {
  const node = { isConnected: true, textContent: "", attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; } };
  setText(node, message("Signed in as {username}", { username: "Show" }));
  setLabel(node, "aria-label", "Show new app password");
  setLanguage("zh-HK");
  assert.equal(node.textContent, "已登入為 Show");
  assert.equal(node.attributes["aria-label"], "顯示新的應用程式密碼");
  setText(node, message("Import stopped. {error}{previous}", {
    error: errorMessage(new Error("The username or password is incorrect.")),
    previous: message(" Your last completed dashboard is still available."),
  }));
  assert.match(node.textContent, /使用者名稱或密碼不正確/);
  setLanguage("en");
  assert.equal(node.textContent, "Import stopped. The username or password is incorrect. Your last completed dashboard is still available.");
});

test("language persists per browser and storage failures leave the switch usable", async () => {
  const savedWindow = globalThis.window;
  const storage = new Map();
  globalThis.window = { localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
  try {
    setLanguage("zh-HK");
    assert.equal(storage.get(STORAGE_KEY), "zh-HK");
    const restored = await import("../viz/i18n.mjs?restored-language");
    assert.equal(restored.getLanguage(), "zh-HK");
    globalThis.window = { get localStorage() { throw new Error("Blocked storage"); } };
    assert.doesNotThrow(() => setLanguage("en"));
    assert.equal(getLanguage(), "en");
    setLanguage("unsupported");
    assert.equal(getLanguage(), "en");
  } finally {
    globalThis.window = savedWindow;
    setLanguage("en");
  }
});

test("all ten charts translate while retaining metrics, filters and original records", () => {
  const source = [2024, 2025, 2026].flatMap((year) => [1, 2, 3].map((month) => ({
    date: `${year}-0${month}-03`, activity_type: "running", activity_name: "Morning run",
    distance_km: 5, pace_s_per_km: 300, duration_s: 1500, avg_hr: 145, elevation_m: 50, vo2max: 52,
  })));
  const original = structuredClone(source);
  const activities = prepareActivities(source);
  for (const insight of INSIGHTS) {
    const state = { year: 2026, startMonth: 1, endMonth: 12, activityType: "run",
      distanceBucket: "all", weeklyUnit: "distance", bestDistance: "5", insight: insight.id };
    const options = { today: new Date("2026-10-21T12:00:00Z") };
    const en = buildInsight(activities, state, options);
    setLanguage("zh-HK");
    const zh = buildInsight(activities, state, options);
    assert.match(zh.note, /[\u3400-\u9fff]/, insight.id);
    assert.deepEqual(zh.summary, en.summary, insight.id);
    assert.equal(zh.traces.length, en.traces.length, insight.id);
    zh.traces.forEach((trace, index) => {
      if (insight.id !== "calendar") assert.deepEqual(trace.y, en.traces[index].y, insight.id);
      else assert.deepEqual(trace.z, en.traces[index].z);
    });
    assert.equal(zh.rows[0].name, "1月");
    setLanguage("en");
  }
  assert.deepEqual(source, original);
});

test("Chinese empty states, service errors and calendar dates stay localized", () => {
  setLanguage("zh-HK");
  try {
    assert.equal(monthNames("short")[9], "10月");
    assert.match(weekdayNames()[0], /一/);
    assert.match(activityDate("2026-01-01"), /2026年1月1日/);
    assert.match(t(errorMessage(new Error("Unrecognized upstream English error"))), /未能完成/);
    for (const insight of INSIGHTS) {
      const result = buildInsight([], { year: 2026, startMonth: 1, endMonth: 12,
        activityType: "run", distanceBucket: "all", weeklyUnit: "distance", bestDistance: "5", insight: insight.id });
      assert.match(result.note, /[\u3400-\u9fff]/, insight.id);
    }
  } finally { setLanguage("en"); }
});
