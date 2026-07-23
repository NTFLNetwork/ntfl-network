
const STORAGE_KEY = "ntfl-draft-v2";
const AUTH_KEY = "ntfl-auth-v2";
const DATA_URL = "data/site-data.json?v=" + Date.now();
const DEMO_USER = "demo";
const DEMO_PASS = "demo123";

const state = {
  data: null,
  route: { page: "home", slug: "" },
  ui: {
    search: "",
    teamTabs: {},
    week: 3,
    division: "",
    adminWeek: 3,
    adminDivision: "",
    adminTeam: "",
    adminRankDrag: null,
    statusFilter: "all"
  }
};

const app = document.getElementById("app");

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}
function slugify(v) {
  return String(v ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}
function teamLookup() {
  return state.data?.teams || {};
}
function teamsArray() {
  return Object.values(teamLookup());
}
function getTeam(slug) {
  return state.data?.teams?.[slug];
}
function currentWeek() {
  return Number(state.data?.site?.currentWeek || 1);
}
function teamRouteSlug(name) {
  return slugify(name);
}
function isAuthed() {
  return localStorage.getItem(AUTH_KEY) === "1";
}
function setAuthed(v) {
  if (v) localStorage.setItem(AUTH_KEY, "1");
  else localStorage.removeItem(AUTH_KEY);
}
function loadDraft() {
  try {
    const draft = localStorage.getItem(STORAGE_KEY);
    return draft ? JSON.parse(draft) : null;
  } catch {
    return null;
  }
}
function saveDraft(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function clearDraft() {
  localStorage.removeItem(STORAGE_KEY);
}
function logoSrc() {
  return "assets/league-logo.jpeg";
}
function statusLabel(status) {
  if (status === "final") return "FINAL";
  if (status === "live") return "LIVE";
  return "UPCOMING";
}
function statusPillClass(status) {
  if (status === "final") return "good";
  if (status === "live") return "live";
  return "";
}
function teamColors(team) {
  return [
    team?.primaryColor || "#1d4ed8",
    team?.secondaryColor || "#ef4444"
  ];
}
function teamAbbr(team) {
  return (team?.abbr || team?.name || "NTFL").toUpperCase();
}
function teamBadgeStyle(team) {
  const [a, b] = teamColors(team);
  return `background: linear-gradient(145deg, ${a}, ${b});`;
}
function teamBadge(team) {
  return `<span class="team-badge" style="${teamBadgeStyle(team)}">${esc(teamAbbr(team))}</span>`;
}
function gameStatus(game) {
  return game.status || (game.played ? "final" : "upcoming");
}
function scoreText(game) {
  const status = gameStatus(game);
  const hs = Number.isFinite(Number(game.homeScore)) ? Number(game.homeScore) : "—";
  const as = Number.isFinite(Number(game.awayScore)) ? Number(game.awayScore) : "—";
  if (status === "final") return `${hs} - ${as}`;
  if (status === "live") return `LIVE ${hs} - ${as}`;
  return game.note || game.time || "Scheduled";
}
function gameResult(game) {
  if (gameStatus(game) !== "final" || !Number.isFinite(Number(game.homeScore)) || !Number.isFinite(Number(game.awayScore))) return "";
  if (Number(game.homeScore) > Number(game.awayScore)) return "home";
  if (Number(game.homeScore) < Number(game.awayScore)) return "away";
  return "tie";
}
function formatRecord(row) {
  return `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`;
}
function currentBackend() {
  return state.data?.site?.backend || {};
}
function backendReady() {
  const b = currentBackend();
  return !!(b.enabled && b.url && b.anonKey && b.table && b.rowId);
}
function routeFromHash() {
  const hash = location.hash.replace(/^#\/?/, "");
  if (!hash) return { page: "home", slug: "" };
  const parts = hash.split("/").filter(Boolean);
  return { page: parts[0] || "home", slug: parts.slice(1).join("/") };
}
function go(page, slug = "") {
  location.hash = slug ? `#/${page}/${slug}` : `#/${page}`;
}
function setTeamTab(slug, tab) {
  state.ui.teamTabs[slug] = tab;
  render();
}
function setSearch(v) {
  state.ui.search = v;
  render();
}
function setAdminWeek(v) {
  state.ui.adminWeek = Number(v);
  render();
}
function setAdminDivision(v) {
  state.ui.adminDivision = v;
  state.ui.adminWeek = Number(state.ui.adminWeek || currentWeek());
  render();
}
function setAdminTeam(v) {
  state.ui.adminTeam = v;
  render();
}
function setStatusFilter(v) {
  state.ui.statusFilter = v;
  render();
}
function addDays(start, days) {
  const d = new Date(start);
  d.setDate(d.getDate() + days);
  return d;
}
function lastUpdatedText() {
  return state.data?.site?.lastUpdated || new Date().toISOString().slice(0, 10);
}

function normalizeData(raw) {
  const data = clone(raw || {});
  data.site = Object.assign({
    name: "NTFL",
    season: "Season 3",
    currentWeek: 3,
    subtitle: "A clean public league hub built for daily updates and public publishing.",
    lastUpdated: new Date().toISOString().slice(0, 10),
    brand: { abbr: "NTFL", primary: "#0B2C5B", accent: "#D72638", surface: "#0f172a" },
    backend: { enabled: false, provider: "supabase", url: "", anonKey: "", table: "site_state", rowId: "ntfl", syncField: "payload" }
  }, data.site || {});
  data.divisions = Array.isArray(data.divisions) ? data.divisions : [];
  data.games = Array.isArray(data.games) ? data.games : [];
  data.rankings = Array.isArray(data.rankings) ? data.rankings : [];
  data.awards = Array.isArray(data.awards) ? data.awards : [];
  data.history = Array.isArray(data.history) ? data.history : [];
  data.hallOfFame = Array.isArray(data.hallOfFame) ? data.hallOfFame : [];
  data.teams = data.teams && !Array.isArray(data.teams) ? data.teams : {};

  Object.values(data.teams).forEach(t => {
    const slug = t.slug || slugify(t.name);
    t.slug = slug;
    t.name = t.name || slug;
    t.abbr = (t.abbr || t.name).toUpperCase();
    t.primaryColor = t.primaryColor || "#1d4ed8";
    t.secondaryColor = t.secondaryColor || "#ef4444";
    t.headCoach = t.headCoach || "TBD";
    t.assistantCoach = t.assistantCoach || "";
    t.notes = t.notes || "Use Admin to add a team rundown.";
    t.division = t.division || "";
  });

  rebuildDerived(data);
  return data;
}

function rebuildDerived(data) {
  const teams = data.teams || {};
  const bySlug = {};
  Object.values(teams).forEach(team => {
    const slug = team.slug || slugify(team.name);
    team.slug = slug;
    team.schedule = [];
    team.gamesPlayed = 0;
    team.wins = 0;
    team.losses = 0;
    team.ties = 0;
    team.pointsFor = 0;
    team.pointsAgainst = 0;
    team.pointDiff = 0;
    team.ppg = 0;
    team.oppg = 0;
    team.streak = "—";
    team.last5 = [];
    bySlug[slug] = team;
  });

  const finalsByTeam = {};
  (data.games || []).forEach(game => {
    game.status = game.status || (Number.isFinite(Number(game.homeScore)) && Number.isFinite(Number(game.awayScore)) ? "final" : "upcoming");
    const homeSlug = teamRouteSlug(game.home);
    const awaySlug = teamRouteSlug(game.away);
    const weekLabel = game.week || `W${game.weekNumber || ""}`;
    const scoreHome = Number.isFinite(Number(game.homeScore)) ? Number(game.homeScore) : null;
    const scoreAway = Number.isFinite(Number(game.awayScore)) ? Number(game.awayScore) : null;

    const homeEntry = {
      week: game.weekNumber || 0,
      weekLabel,
      opponent: game.away,
      home: true,
      status: game.status,
      scoreFor: scoreHome,
      scoreAgainst: scoreAway,
      note: game.note || game.time || "",
      gameId: game.id,
      time: game.time || ""
    };
    const awayEntry = {
      week: game.weekNumber || 0,
      weekLabel,
      opponent: game.home,
      home: false,
      status: game.status,
      scoreFor: scoreAway,
      scoreAgainst: scoreHome,
      note: game.note || game.time || "",
      gameId: game.id,
      time: game.time || ""
    };

    if (bySlug[homeSlug]) {
      bySlug[homeSlug].schedule.push(homeEntry);
      if (game.status === "final" && scoreHome !== null && scoreAway !== null) {
        finalsByTeam[homeSlug] = finalsByTeam[homeSlug] || [];
        finalsByTeam[homeSlug].push(homeEntry);
        bySlug[homeSlug].gamesPlayed += 1;
        bySlug[homeSlug].pointsFor += scoreHome;
        bySlug[homeSlug].pointsAgainst += scoreAway;
        if (scoreHome > scoreAway) bySlug[homeSlug].wins += 1;
        else if (scoreHome < scoreAway) bySlug[homeSlug].losses += 1;
        else bySlug[homeSlug].ties += 1;
      }
    }
    if (bySlug[awaySlug]) {
      bySlug[awaySlug].schedule.push(awayEntry);
      if (game.status === "final" && scoreHome !== null && scoreAway !== null) {
        finalsByTeam[awaySlug] = finalsByTeam[awaySlug] || [];
        finalsByTeam[awaySlug].push(awayEntry);
        bySlug[awaySlug].gamesPlayed += 1;
        bySlug[awaySlug].pointsFor += scoreAway;
        bySlug[awaySlug].pointsAgainst += scoreHome;
        if (scoreAway > scoreHome) bySlug[awaySlug].wins += 1;
        else if (scoreAway < scoreHome) bySlug[awaySlug].losses += 1;
        else bySlug[awaySlug].ties += 1;
      }
    }
  });

  Object.values(bySlug).forEach(team => {
    team.schedule.sort((a, b) => a.week - b.week);
    const finals = finalsByTeam[team.slug] || [];
    finals.sort((a, b) => a.week - b.week);
    team.last5 = finals.slice(-5).reverse();
    team.pointDiff = team.pointsFor - team.pointsAgainst;
    team.ppg = team.gamesPlayed ? team.pointsFor / team.gamesPlayed : 0;
    team.oppg = team.gamesPlayed ? team.pointsAgainst / team.gamesPlayed : 0;
    if (finals.length) {
      const last = finals[finals.length - 1].scoreFor > finals[finals.length - 1].scoreAgainst ? "W" :
        finals[finals.length - 1].scoreFor < finals[finals.length - 1].scoreAgainst ? "L" : "T";
      let streakCount = 0;
      for (let i = finals.length - 1; i >= 0; i--) {
        const cur = finals[i].scoreFor > finals[i].scoreAgainst ? "W" :
          finals[i].scoreFor < finals[i].scoreAgainst ? "L" : "T";
        if (cur !== last) break;
        streakCount++;
      }
      team.streak = `${last}${streakCount}`;
    }
  });

  data.standings = Object.values(bySlug)
    .map(team => ({
      rank: 0,
      slug: team.slug,
      abbr: team.abbr,
      team: team.name,
      division: team.division || "",
      record: `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""}`,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      pointsFor: team.pointsFor,
      pointsAgainst: team.pointsAgainst,
      pointDiff: team.pointDiff,
      ppg: Number(team.ppg.toFixed(1)),
      oppg: Number(team.oppg.toFixed(1))
    }))
    .sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff || b.pointsFor - a.pointsFor || a.team.localeCompare(b.team))
    .map((r, idx) => ({ ...r, rank: idx + 1 }));

  const statsBySlug = Object.fromEntries(data.standings.map(s => [s.slug, s]));
  data.rankings = (data.rankings && data.rankings.length ? [...data.rankings] : data.standings.map(s => ({
    rank: s.rank, team: s.team, slug: s.slug, division: s.division, record: s.record,
    pointDiff: s.pointDiff, pointsFor: s.pointsFor, pointsAgainst: s.pointsAgainst, ppg: s.ppg, oppg: s.oppg
  })))
    .sort((a, b) => Number(a.rank || 999) - Number(b.rank || 999))
    .map((r, idx) => {
      const s = statsBySlug[r.slug || slugify(r.team)] || {};
      return {
        ...r,
        rank: idx + 1,
        slug: r.slug || slugify(r.team),
        team: r.team || s.team || "",
        division: r.division || s.division || "",
        record: s.record || r.record || "0-0",
        pointDiff: s.pointDiff ?? r.pointDiff ?? 0,
        pointsFor: s.pointsFor ?? r.pointsFor ?? 0,
        pointsAgainst: s.pointsAgainst ?? r.pointsAgainst ?? 0,
        ppg: s.ppg ?? r.ppg ?? 0,
        oppg: s.oppg ?? r.oppg ?? 0
      };
    });
}

async function loadData() {
  const draft = loadDraft();
  if (draft) {
    try { return normalizeData(draft); } catch (e) {}
  }
  const localRes = await fetch(DATA_URL, { cache: "no-store" });
  if (!localRes.ok) throw new Error("Could not load data");
  const localData = normalizeData(await localRes.json());
  const backend = localData.site.backend || {};
  if (backend.enabled && backend.url && backend.anonKey) {
    try {
      const api = `${backend.url.replace(/\/$/, "")}/rest/v1/${backend.table}?${backend.syncField}=not.is.null&select=${backend.syncField}&id=eq.${encodeURIComponent(backend.rowId)}&limit=1`;
      const res = await fetch(api, {
        headers: {
          apikey: backend.anonKey,
          Authorization: `Bearer ${backend.anonKey}`
        }
      });
      if (res.ok) {
        const rows = await res.json();
        const payload = rows?.[0]?.[backend.syncField];
        if (payload) return normalizeData(payload);
      }
    } catch (e) {
      console.warn("Backend load failed; using local JSON.", e);
    }
  }
  return localData;
}

function saveBrowserDraft() {
  saveDraft(state.data);
  localStorage.setItem(STORAGE_KEY + ":savedAt", new Date().toISOString());
}

function syncSiteInputs() {
  const card = document.getElementById("site-editor");
  if (!card) return;
  const inputs = [...card.querySelectorAll("input, textarea, select")];
  const map = Object.fromEntries(inputs.map(i => [i.name, i.value]));
  state.data.site.name = map.siteName || state.data.site.name;
  state.data.site.season = map.siteSeason || state.data.site.season;
  state.data.site.currentWeek = Number(map.siteWeek || state.data.site.currentWeek || 1);
  state.data.site.subtitle = map.siteSubtitle || state.data.site.subtitle;
  state.data.site.lastUpdated = new Date().toISOString().slice(0, 10);
  state.data.site.backend.enabled = !!card.querySelector('[name="backendEnabled"]')?.checked;
  state.data.site.backend.url = map.backendUrl || "";
  state.data.site.backend.anonKey = map.backendKey || "";
  state.data.site.backend.table = map.backendTable || "site_state";
  state.data.site.backend.rowId = map.backendRowId || "ntfl";
}

function syncGames() {
  const list = document.getElementById("games-editor");
  if (!list) return;
  [...list.querySelectorAll(".game-edit")].forEach(row => {
    const id = row.dataset.gameId;
    const game = state.data.games.find(g => g.id === id);
    if (!game) return;
    const get = f => row.querySelector(`[data-field="${f}"]`)?.value ?? "";
    game.homeScore = get("homeScore") === "" ? null : Number(get("homeScore"));
    game.awayScore = get("awayScore") === "" ? null : Number(get("awayScore"));
    game.status = get("status") || "upcoming";
    game.time = get("time") || "";
    game.note = get("note") || "";
  });
  state.data.site.lastUpdated = new Date().toISOString().slice(0, 10);
  rebuildDerived(state.data);
}

function syncTeam() {
  const card = document.getElementById("team-editor");
  if (!card) return;
  const team = getTeam(state.ui.adminTeam);
  if (!team) return;
  team.headCoach = card.querySelector('[name="headCoach"]')?.value || "TBD";
  team.assistantCoach = card.querySelector('[name="assistantCoach"]')?.value || "";
  team.notes = card.querySelector('[name="notes"]')?.value || "";
  team.abbr = (card.querySelector('[name="abbr"]')?.value || team.abbr || "").toUpperCase();
  team.primaryColor = card.querySelector('[name="primaryColor"]')?.value || team.primaryColor;
  team.secondaryColor = card.querySelector('[name="secondaryColor"]')?.value || team.secondaryColor;
  state.data.site.lastUpdated = new Date().toISOString().slice(0, 10);
  rebuildDerived(state.data);
}

function syncAwards() {
  const rows = [...document.querySelectorAll("#awards-editor [data-award-row]")];
  state.data.awards = rows.map(row => ({
    category: row.querySelector('[data-field="category"]')?.value || "",
    winner: row.querySelector('[data-field="winner"]')?.value || "",
    team: row.querySelector('[data-field="team"]')?.value || ""
  }));
  state.data.site.lastUpdated = new Date().toISOString().slice(0, 10);
}

function syncHistory() {
  const rows = [...document.querySelectorAll("#history-editor [data-history-row]")];
  state.data.history = rows.map(row => ({
    season: row.querySelector('[data-field="season"]')?.value || "",
    champion: row.querySelector('[data-field="champion"]')?.value || "",
    record: row.querySelector('[data-field="record"]')?.value || "",
    notes: row.querySelector('[data-field="notes"]')?.value || ""
  }));
  state.data.site.lastUpdated = new Date().toISOString().slice(0, 10);
}

function syncHOF() {
  const rows = [...document.querySelectorAll("#hof-editor [data-hof-row]")];
  state.data.hallOfFame = rows.map(row => ({
    name: row.querySelector('[data-field="name"]')?.value || "",
    team: row.querySelector('[data-field="team"]')?.value || "",
    honor: row.querySelector('[data-field="honor"]')?.value || "",
    notes: row.querySelector('[data-field="notes"]')?.value || ""
  }));
  state.data.site.lastUpdated = new Date().toISOString().slice(0, 10);
}

async function publishPublic() {
  syncSiteInputs();
  syncGames();
  syncTeam();
  syncAwards();
  syncHistory();
  syncHOF();
  rebuildDerived(state.data);
  saveBrowserDraft();

  const b = currentBackend();
  if (!b.enabled || !b.url || !b.anonKey) {
    alert("Public publish is not connected yet. Save the backend settings first.");
    return;
  }

  const base = b.url.replace(/\/$/, "");
  const headers = {
    apikey: b.anonKey,
    Authorization: `Bearer ${b.anonKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates"
  };
  const payload = {};
  payload.id = b.rowId;
  payload[b.syncField || "payload"] = state.data;
  payload.updated_at = new Date().toISOString();

  let res = await fetch(`${base}/rest/v1/${b.table}?on_conflict=id`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    res = await fetch(`${base}/rest/v1/${b.table}?id=eq.${encodeURIComponent(b.rowId)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ [b.syncField || "payload"]: state.data, updated_at: new Date().toISOString() })
    });
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    alert(`Publish failed. Check your backend settings.\n${txt}`);
    return;
  }
  alert("Published publicly.");
}

function downloadJSON() {
  syncSiteInputs();
  syncGames();
  syncTeam();
  syncAwards();
  syncHistory();
  syncHOF();
  rebuildDerived(state.data);
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "site-data.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function saveAllDraft() {
  syncSiteInputs();
  syncGames();
  syncTeam();
  syncAwards();
  syncHistory();
  syncHOF();
  rebuildDerived(state.data);
  saveBrowserDraft();
  render();
  alert("Draft saved in this browser.");
}

function saveSite() {
  syncSiteInputs();
  rebuildDerived(state.data);
  saveBrowserDraft();
  render();
}
function saveGames() {
  syncGames();
  saveBrowserDraft();
  render();
}
function saveTeam() {
  syncTeam();
  saveBrowserDraft();
  render();
}
function saveAwards() {
  syncAwards();
  saveBrowserDraft();
  render();
}
function saveHistory() {
  syncHistory();
  saveBrowserDraft();
  render();
}
function saveHOF() {
  syncHOF();
  saveBrowserDraft();
  render();
}

function login(ev) {
  ev.preventDefault();
  const form = ev.target;
  const user = form.username?.value?.trim();
  const pass = form.password?.value?.trim();
  if (user === DEMO_USER && pass === DEMO_PASS) {
    setAuthed(true);
    render();
    return;
  }
  alert("Login failed.");
}
function logout() {
  setAuthed(false);
  render();
}

function addAward() {
  state.data.awards.push({ category: "", winner: "", team: "" });
  saveBrowserDraft();
  render();
}
function addHistory() {
  state.data.history.push({ season: "", champion: "", record: "", notes: "" });
  saveBrowserDraft();
  render();
}
function addHOF() {
  state.data.hallOfFame.push({ name: "", team: "", honor: "", notes: "" });
  saveBrowserDraft();
  render();
}

function moveRank(from, to) {
  if (to < 0 || to >= state.data.rankings.length || from === to) return;
  const list = [...state.data.rankings];
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  state.data.rankings = list.map((r, i) => ({ ...r, rank: i + 1 }));
  saveBrowserDraft();
  render();
}

function dragRankStart(ev, idx) {
  state.ui.adminRankDrag = idx;
  ev.dataTransfer.effectAllowed = "move";
  ev.dataTransfer.setData("text/plain", String(idx));
}
function dragRankOver(ev) {
  ev.preventDefault();
  ev.dataTransfer.dropEffect = "move";
}
function dropRank(ev, idx) {
  ev.preventDefault();
  const from = Number(ev.dataTransfer.getData("text/plain") || state.ui.adminRankDrag);
  moveRank(from, idx);
}

function teamMark(team) {
  return `<div class="team-mark" style="${teamBadgeStyle(team)}">${esc(teamAbbr(team))}</div>`;
}
function teamStatCards(team) {
  return `
    <div class="stat-card"><span>Record</span><strong>${formatRecord(team)}</strong></div>
    <div class="stat-card"><span>Points For</span><strong>${team.pointsFor}</strong></div>
    <div class="stat-card"><span>Points Against</span><strong>${team.pointsAgainst}</strong></div>
    <div class="stat-card"><span>PPG</span><strong>${Number(team.ppg).toFixed(1)}</strong></div>
    <div class="stat-card"><span>OPPG</span><strong>${Number(team.oppg).toFixed(1)}</strong></div>
    <div class="stat-card"><span>Diff</span><strong>${team.pointDiff >= 0 ? "+" : ""}${team.pointDiff}</strong></div>
  `;
}
function standingsTable(rows, limit = 32) {
  return `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>#</th><th>Team</th><th>Div</th><th>Rec</th><th>PF</th><th>PA</th><th>Diff</th><th>PPG</th>
          </tr>
        </thead>
        <tbody>
          ${(rows || []).slice(0, limit).map(r => `
            <tr>
              <td>${r.rank}</td>
              <td><a href="#/team/${r.slug}">${esc(r.team)}</a></td>
              <td>${esc(r.division)}</td>
              <td><strong>${esc(r.record)}</strong></td>
              <td>${r.pointsFor}</td>
              <td>${r.pointsAgainst}</td>
              <td class="${r.pointDiff >= 0 ? "good" : "bad"}">${r.pointDiff >= 0 ? "+" : ""}${r.pointDiff}</td>
              <td>${Number(r.ppg).toFixed(1)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}
function gameCard(game) {
  const home = getTeam(teamRouteSlug(game.home)) || { name: game.home, slug: teamRouteSlug(game.home), abbr: game.home.slice(0,3).toUpperCase(), primaryColor: "#1d4ed8", secondaryColor: "#ef4444" };
  const away = getTeam(teamRouteSlug(game.away)) || { name: game.away, slug: teamRouteSlug(game.away), abbr: game.away.slice(0,3).toUpperCase(), primaryColor: "#1d4ed8", secondaryColor: "#ef4444" };
  const res = gameResult(game);
  return `
    <article class="card game-card ${gameStatus(game)}">
      <div class="row between">
        <div class="row tight">
          <span class="pill">${esc(game.week || `W${game.weekNumber}`)}</span>
          <span class="pill ${statusPillClass(gameStatus(game))}">${esc(statusLabel(gameStatus(game)))}</span>
        </div>
        <span class="muted tiny">${esc(game.division)}</span>
      </div>
      <div class="game-line">
        <a class="game-team ${res === "home" ? "winner" : ""}" href="#/team/${home.slug}">
          ${teamMark(home)}
          <div>
            <strong>${esc(home.name)}</strong>
            <small>${esc(home.abbr)}</small>
          </div>
        </a>
        <div class="game-score ${gameStatus(game)}">${esc(scoreText(game))}</div>
        <a class="game-team ${res === "away" ? "winner" : ""}" href="#/team/${away.slug}">
          ${teamMark(away)}
          <div>
            <strong>${esc(away.name)}</strong>
            <small>${esc(away.abbr)}</small>
          </div>
        </a>
      </div>
      ${game.note ? `<div class="muted small">${esc(game.note)}</div>` : ""}
    </article>
  `;
}
function headerHTML() {
  return `
    <header class="topbar">
      <div class="container topbar-inner">
        <a class="brand" href="#/home">
          <img src="${logoSrc()}" alt="NTFL logo" class="brand-logo" onerror="this.src='assets/league-logo.jpeg'">
          <div class="brand-copy">
            <strong>${esc(state.data.site.name)}</strong>
            <span>${esc(state.data.site.season)} • Week ${currentWeek()}</span>
          </div>
        </a>
        <nav class="nav">
          <a class="nav-pill" href="#/home">Home</a>
          <details class="menu-drop">
            <summary class="nav-pill">Menu</summary>
            <div class="menu-panel">
              <div class="menu-group">
                <span>League</span>
                <a href="#/teams">Teams</a>
                <a href="#/schedule">Schedule</a>
                <a href="#/standings">Standings</a>
                <a href="#/rankings">Rankings</a>
              </div>
              <div class="menu-group">
                <span>Archive</span>
                <a href="#/awards">Awards</a>
                <a href="#/history">History</a>
                <a href="#/hof">Hall of Fame</a>
              </div>
              <div class="menu-group">
                <span>Tools</span>
                <a href="#/admin">Admin</a>
              </div>
            </div>
          </details>
          <a class="nav-pill nav-admin" href="#/admin">Admin</a>
        </nav>
      </div>
    </header>
  `;
}
function footerHTML() {
  return `
    <footer class="footer container">
      <div>
        <strong>${esc(state.data.site.name)}</strong>
        <p>${esc(state.data.site.season)} • Last updated ${esc(lastUpdatedText())}</p>
      </div>
      <div class="row tight">
        <a class="pill" href="#/teams">Teams</a>
        <a class="pill" href="#/schedule">Schedule</a>
        <a class="pill" href="#/admin">Admin</a>
      </div>
    </footer>
  `;
}

function homePage() {
  const featured = (state.data.games || []).filter(g => Number(g.weekNumber) === currentWeek()).slice(0, 4);
  const top = (state.data.standings || []).slice(0, 4);
  const rankTop = (state.data.rankings || []).slice(0, 8);
  const liveCount = (state.data.games || []).filter(g => gameStatus(g) === "live" && Number(g.weekNumber) === currentWeek()).length;
  return `
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-main card">
          <div class="hero-logo-wrap">
            <img src="${logoSrc()}" alt="League logo" onerror="this.src='assets/league-logo.jpeg'">
          </div>
          <div>
            <div class="eyebrow">${esc(state.data.site.season)} • Week ${currentWeek()}</div>
            <h1>${esc(state.data.site.name)}</h1>
            <p>${esc(state.data.site.subtitle)}</p>
          </div>
          <div class="hero-actions">
            <a class="btn primary" href="#/teams">Browse Teams</a>
            <a class="btn" href="#/schedule">View Schedule</a>
            <a class="btn" href="#/standings">Standings</a>
          </div>
        </div>
        <div class="hero-side grid stacked">
          <div class="stat-card"><span>Teams</span><strong>${Object.keys(state.data.teams || {}).length}</strong></div>
          <div class="stat-card"><span>Live Games</span><strong>${liveCount}</strong></div>
          <div class="stat-card"><span>Top Team</span><strong>${top[0] ? esc(top[0].team) : "—"}</strong></div>
        </div>
      </div>
    </section>

    <section class="section-grid">
      <div class="section-head">
        <h2>Featured Games</h2>
        <a href="#/schedule">View all</a>
      </div>
      <div class="grid cards-2">
        ${featured.map(gameCard).join("") || `<div class="card empty">No featured games for this week.</div>`}
      </div>
    </section>

    <section class="section-grid two-col">
      <div>
        <div class="section-head"><h2>Standings</h2><a href="#/standings">Full table</a></div>
        ${standingsTable(top, 4)}
      </div>
      <div>
        <div class="section-head"><h2>Power Rankings</h2><a href="#/rankings">Full list</a></div>
        <div class="grid stacked">
          ${rankTop.map(r => `
            <a class="mini-row" href="#/team/${r.slug}">
              <div class="mini-rank">#${r.rank}</div>
              <div class="mini-body">
                <strong>${esc(r.team)}</strong>
                <span>${esc(r.record)} • ${r.pointDiff >= 0 ? "+" : ""}${r.pointDiff} diff</span>
              </div>
            </a>
          `).join("")}
        </div>
      </div>
    </section>

    <section class="section-grid">
      <div class="section-head"><h2>Quick Access</h2><a href="#/teams">All teams</a></div>
      <div class="grid team-grid">
        ${(teamsArray().slice(0, 8)).map(team => `
          <a class="team-card" href="#/team/${team.slug}">
            ${teamMark(team)}
            <div class="team-meta">
              <strong>${esc(team.name)}</strong>
              <span>${esc(team.division)}</span>
              <small>${formatRecord(team)}</small>
            </div>
          </a>
        `).join("")}
      </div>
    </section>
  `;
}
function teamsPage() {
  const search = state.ui.search.toLowerCase();
  const teams = teamsArray().filter(t => {
    const s = `${t.name} ${t.abbr} ${t.division} ${t.headCoach} ${t.assistantCoach}`.toLowerCase();
    return !search || s.includes(search);
  });
  const divisions = [...new Set(teamsArray().map(t => t.division).filter(Boolean))];
  return `
    <section class="page-head">
      <div>
        <div class="eyebrow">League</div>
        <h1>Teams</h1>
        <p>Every team has a clean page with coaches, schedule, PPG, and notes.</p>
      </div>
      <div class="page-tools">
        <input class="search" type="search" placeholder="Search teams or coaches" value="${esc(state.ui.search)}" oninput="NTFL.searchTeams(this.value)">
      </div>
    </section>
    <div class="chip-row">
      <button class="chip ${!state.ui.search ? "active" : ""}" onclick="NTFL.searchTeams('')">All</button>
      ${divisions.map(d => `<button class="chip" onclick="NTFL.searchTeams('${esc(d)}')">${esc(d)}</button>`).join("")}
    </div>
    <section class="grid team-grid large">
      ${teams.map(team => `
        <a class="team-card large" href="#/team/${team.slug}">
          ${teamMark(team)}
          <div class="team-meta">
            <strong>${esc(team.name)}</strong>
            <span>${esc(team.division)}</span>
            <small>${formatRecord(team)} • PPG ${Number(team.ppg).toFixed(1)}</small>
            <small>${esc(team.headCoach)}${team.assistantCoach ? ` • ${esc(team.assistantCoach)}` : ""}</small>
          </div>
        </a>
      `).join("")}
    </section>
  `;
}
function teamPage() {
  const team = getTeam(state.route.slug);
  if (!team) return `<div class="card empty">Team not found.</div>`;
  const tab = state.ui.teamTabs[team.slug] || "overview";
  const content = {
    overview: `
      <div class="grid stats-grid">${teamStatCards(team)}</div>
      <div class="grid two-col">
        <div class="card">
          <h3>Season Snapshot</h3>
          <p class="muted">Final games update record, standings, and PPG automatically.</p>
          <div class="grid stacked">
            ${(team.last5 || []).length ? team.last5.map(g => `
              <div class="mini-row">
                <div class="mini-rank ${g.scoreFor > g.scoreAgainst ? "good" : g.scoreFor < g.scoreAgainst ? "bad" : ""}">${g.scoreFor > g.scoreAgainst ? "W" : g.scoreFor < g.scoreAgainst ? "L" : "T"}</div>
                <div class="mini-body">
                  <strong>${esc(g.weekLabel)} vs ${esc(g.opponent)}</strong>
                  <span>${g.scoreFor ?? "—"} - ${g.scoreAgainst ?? "—"}</span>
                </div>
              </div>
            `).join("") : `<div class="empty">No completed games yet.</div>`}
          </div>
        </div>
        <div class="card">
          <h3>Team Rundown</h3>
          <div class="notes-box">${esc(team.notes || "No notes yet.")}</div>
        </div>
      </div>
    `,
    schedule: `
      <div class="grid stacked">
        ${(team.schedule || []).map(g => `
          <article class="card schedule-row ${g.status}">
            <div class="row between">
              <div class="row tight">
                <span class="pill">${esc(g.weekLabel)}</span>
                <span class="pill ${statusPillClass(g.status)}">${esc(statusLabel(g.status))}</span>
              </div>
              <span class="muted">${esc(g.note || g.time || "")}</span>
            </div>
            <div class="game-line compact">
              <div class="game-team compact ${g.scoreFor > g.scoreAgainst ? "winner" : ""}">
                <strong>${g.home ? "vs" : "@"} ${esc(g.opponent)}</strong>
              </div>
              <div class="game-score ${g.status}">${esc(scoreText({ ...g, homeScore: g.scoreFor, awayScore: g.scoreAgainst }))}</div>
              <div class="game-team compact">
                <strong>${g.home ? "Home" : "Away"}</strong>
              </div>
            </div>
          </article>
        `).join("") || `<div class="card empty">No schedule available.</div>`}
      </div>
    `,
    ppg: `
      <div class="grid stats-grid">
        <div class="stat-card"><span>Offense PPG</span><strong>${Number(team.ppg).toFixed(1)}</strong></div>
        <div class="stat-card"><span>Defense PPG</span><strong>${Number(team.oppg).toFixed(1)}</strong></div>
        <div class="stat-card"><span>Point Diff</span><strong>${team.pointDiff >= 0 ? "+" : ""}${team.pointDiff}</strong></div>
        <div class="stat-card"><span>Games Played</span><strong>${team.gamesPlayed}</strong></div>
      </div>
      <div class="card">
        <h3>PPG Breakdown</h3>
        <div class="bar-row"><span>Offense</span><div class="bar"><div style="width:${Math.min(100, (team.ppg / 50) * 100)}%"></div></div><strong>${Number(team.ppg).toFixed(1)}</strong></div>
        <div class="bar-row"><span>Defense</span><div class="bar"><div style="width:${Math.min(100, (team.oppg / 50) * 100)}%"></div></div><strong>${Number(team.oppg).toFixed(1)}</strong></div>
      </div>
    `,
    coaches: `
      <div class="grid two-col">
        <div class="card"><h3>Head Coach</h3><p class="coach-tag">${esc(team.headCoach || "TBD")}</p></div>
        <div class="card"><h3>Assistant Coach</h3><p class="coach-tag">${esc(team.assistantCoach || "TBD")}</p></div>
      </div>
    `,
    notes: `
      <div class="card">
        <h3>Notes</h3>
        <div class="notes-box">${esc(team.notes || "No notes yet.")}</div>
      </div>
    `
  }[tab];

  return `
    <section class="page-head team-head">
      <div class="team-hero">
        ${teamMark(team)}
        <div>
          <div class="eyebrow">${esc(team.division)}</div>
          <h1>${esc(team.name)}</h1>
          <p>${esc(team.headCoach || "TBD")}${team.assistantCoach ? ` • ${esc(team.assistantCoach)}` : ""}</p>
        </div>
      </div>
      <div class="page-tools">
        <span class="pill">${formatRecord(team)}</span>
        <span class="pill">PPG ${Number(team.ppg).toFixed(1)}</span>
      </div>
    </section>

    <div class="tabs">
      ${["overview","schedule","ppg","coaches","notes"].map(t => `<button class="tab ${tab===t?"active":""}" onclick="NTFL.setTeamTab('${team.slug}','${t}')">${t}</button>`).join("")}
    </div>

    <section class="section-grid">${content}</section>
  `;
}
function schedulePage() {
  const weeks = [...new Set((state.data.games || []).map(g => Number(g.weekNumber || 0)).filter(Boolean))].sort((a, b) => a - b);
  const week = state.ui.adminWeek || currentWeek();
  const divisionFilter = state.ui.statusFilter === "all" ? "" : state.ui.statusFilter;
  const games = (state.data.games || [])
    .filter(g => Number(g.weekNumber || 0) === week)
    .filter(g => !divisionFilter || g.status === divisionFilter || divisionFilter === "all")
    .sort((a, b) => (a.division || "").localeCompare(b.division || "") || (a.home || "").localeCompare(b.home || ""));
  return `
    <section class="page-head">
      <div>
        <div class="eyebrow">League</div>
        <h1>Schedule</h1>
        <p>A clean schedule board with clear status, scores, and team badges.</p>
      </div>
      <div class="page-tools">
        <select class="select" onchange="NTFL.setAdminWeek(this.value)">
          ${weeks.map(w => `<option value="${w}" ${w===week ? "selected" : ""}>Week ${w}</option>`).join("")}
        </select>
      </div>
    </section>
    <div class="chip-row">
      <button class="chip ${state.ui.statusFilter==="all" ? "active" : ""}" onclick="NTFL.setStatusFilter('all')">All</button>
      <button class="chip ${state.ui.statusFilter==="final" ? "active" : ""}" onclick="NTFL.setStatusFilter('final')">Final</button>
      <button class="chip ${state.ui.statusFilter==="live" ? "active" : ""}" onclick="NTFL.setStatusFilter('live')">Live</button>
      <button class="chip ${state.ui.statusFilter==="upcoming" ? "active" : ""}" onclick="NTFL.setStatusFilter('upcoming')">Upcoming</button>
    </div>
    <div class="grid stacked">
      ${games.map(gameCard).join("") || `<div class="card empty">Schedule not found.</div>`}
    </div>
  `;
}
function standingsPage() {
  const rows = state.data.standings || [];
  return `
    <section class="page-head">
      <div>
        <div class="eyebrow">League</div>
        <h1>Standings</h1>
        <p>Recalculated automatically from final scores.</p>
      </div>
    </section>
    ${standingsTable(rows, rows.length)}
  `;
}
function rankingsPage() {
  const rows = state.data.rankings || [];
  return `
    <section class="page-head">
      <div>
        <div class="eyebrow">League</div>
        <h1>Rankings</h1>
        <p>Drag and drop in Admin to reorder the public rankings list.</p>
      </div>
    </section>
    <div class="grid stacked">
      ${rows.map(r => `
        <a class="mini-row ranking-row" href="#/team/${r.slug}">
          <div class="mini-rank">#${r.rank}</div>
          <div class="mini-body">
            <strong>${esc(r.team)}</strong>
            <span>${esc(r.record)} • ${esc(r.division)} • ${r.pointDiff >= 0 ? "+" : ""}${r.pointDiff} diff</span>
          </div>
        </a>
      `).join("")}
    </div>
  `;
}
function awardsPage() {
  return `
    <section class="page-head">
      <div>
        <div class="eyebrow">Archive</div>
        <h1>Awards</h1>
        <p>Editable league honors and winners.</p>
      </div>
    </section>
    <div class="grid cols-2">
      ${(state.data.awards || []).map(a => `
        <div class="card">
          <h3>${esc(a.category || "Award")}</h3>
          <p class="award-winner">${esc(a.winner || "TBD")}</p>
          <p class="muted">${esc(a.team || "TBD")}</p>
        </div>
      `).join("") || `<div class="card empty">No awards added yet.</div>`}
    </div>
  `;
}
function historyPage() {
  return `
    <section class="page-head">
      <div>
        <div class="eyebrow">Archive</div>
        <h1>History</h1>
        <p>Season archive and past notes.</p>
      </div>
    </section>
    <div class="grid stacked">
      ${(state.data.history || []).map(h => `
        <div class="card">
          <div class="row between">
            <h3>${esc(h.season || "Season")}</h3>
            <span class="pill">${esc(h.record || "TBD")}</span>
          </div>
          <p><strong>Champion:</strong> ${esc(h.champion || "TBD")}</p>
          <p class="muted">${esc(h.notes || "")}</p>
        </div>
      `).join("")}
    </div>
  `;
}
function hofPage() {
  return `
    <section class="page-head">
      <div>
        <div class="eyebrow">Archive</div>
        <h1>Hall of Fame</h1>
        <p>Special honors and league legends.</p>
      </div>
    </section>
    <div class="grid cols-2">
      ${(state.data.hallOfFame || []).map(h => `
        <div class="card">
          <h3>${esc(h.name || "Honoree")}</h3>
          <p>${esc(h.team || "")}</p>
          <p class="muted">${esc(h.honor || "")}${h.notes ? ` • ${esc(h.notes)}` : ""}</p>
        </div>
      `).join("") || `<div class="card empty">No Hall of Fame entries yet.</div>`}
    </div>
  `;
}
function adminLoginPage() {
  return `
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-main card">
          <div class="hero-logo-wrap">
            <img src="${logoSrc()}" alt="NTFL logo" onerror="this.src='assets/league-logo.jpeg'">
          </div>
          <div>
            <div class="eyebrow">Admin access</div>
            <h1>Login</h1>
            <p>Private editing access for NTFL admins.</p>
          </div>
          <form class="login-form" onsubmit="NTFL.login(event)">
            <input class="input" type="text" name="username" placeholder="Username" autocomplete="username" required>
            <input class="input" type="password" name="password" placeholder="Password" autocomplete="current-password" required>
            <button class="btn primary" type="submit">Sign in</button>
          </form>
        </div>
        <div class="hero-side">
          <div class="card">
            <h3>Public publishing</h3>
            <p class="muted">Connect a shared backend once, then every publish updates the live site for everyone.</p>
          </div>
        </div>
      </div>
    </section>
  `;
}
function adminPage() {
  if (!isAuthed()) return adminLoginPage();
  const divisions = [...new Set(teamsArray().map(t => t.division).filter(Boolean))];
  const teams = teamsArray();
  if (!state.ui.adminDivision && divisions[0]) state.ui.adminDivision = divisions[0];
  if (!state.ui.adminTeam && teams[0]) state.ui.adminTeam = teams[0].slug;
  if (!state.ui.adminWeek) state.ui.adminWeek = currentWeek();
  const division = state.ui.adminDivision || divisions[0];
  const week = Number(state.ui.adminWeek || currentWeek());
  const divisionGames = (state.data.games || []).filter(g => g.division === division);
  const weeks = [...new Set(divisionGames.map(g => Number(g.weekNumber || 0)).filter(Boolean))].sort((a, b) => a - b);
  const weekGames = divisionGames.filter(g => Number(g.weekNumber || 0) === week);
  const selectedTeam = getTeam(state.ui.adminTeam) || teams[0];

  return `
    <section class="page-head admin-head">
      <div>
        <div class="eyebrow">Admin</div>
        <h1>Dashboard</h1>
        <p>Update the entire site from one place and publish it publicly when ready.</p>
      </div>
      <div class="page-tools">
        <button class="btn" onclick="NTFL.download()">Download site-data.json</button>
        <button class="btn" onclick="NTFL.saveAllDraft()">Save Draft</button>
        <button class="btn primary" onclick="NTFL.publishPublic()">Publish Public</button>
        <button class="btn danger" onclick="NTFL.logout()">Logout</button>
      </div>
    </section>

    <div class="admin-grid">
      <div class="admin-col">
        <div class="card" id="site-editor">
          <div class="section-head"><div><h2>Site settings</h2><p class="muted">League name, season, current week, and backend connection.</p></div></div>
          <div class="form-grid">
            <label>League Name<input class="input" name="siteName" value="${esc(state.data.site.name)}"></label>
            <label>Season<input class="input" name="siteSeason" value="${esc(state.data.site.season)}"></label>
            <label>Current Week<input class="input" type="number" min="1" name="siteWeek" value="${esc(state.data.site.currentWeek)}"></label>
            <label>Subtitle<input class="input" name="siteSubtitle" value="${esc(state.data.site.subtitle)}"></label>
            <label><input type="checkbox" name="backendEnabled" ${backendReady() ? "checked" : ""}> Enable public backend publishing</label>
            <label>Backend URL<input class="input" name="backendUrl" value="${esc(state.data.site.backend.url || "")}" placeholder="https://xxxxx.supabase.co"></label>
            <label>Anon Key<input class="input" name="backendKey" value="${esc(state.data.site.backend.anonKey || "")}" placeholder="Supabase anon key"></label>
            <label>Table<input class="input" name="backendTable" value="${esc(state.data.site.backend.table || "site_state")}"></label>
            <label>Row ID<input class="input" name="backendRowId" value="${esc(state.data.site.backend.rowId || "ntfl")}"></label>
          </div>
          <div class="row right">
            <button class="btn primary" onclick="NTFL.saveSite()">Save Site Settings</button>
          </div>
        </div>

        <div class="card" id="games-editor">
          <div class="section-head"><div><h2>Games</h2><p class="muted">Change scores, time notes, and status. Finals update standings and PPG automatically.</p></div></div>
          <div class="form-grid compact">
            <label>Division
              <select class="select" onchange="NTFL.setAdminDivision(this.value)">
                ${(divisions || []).map(d => `<option value="${esc(d)}" ${division===d ? "selected" : ""}>${esc(d)}</option>`).join("")}
              </select>
            </label>
            <label>Week
              <select class="select" onchange="NTFL.setAdminWeek(this.value)">
                ${weeks.map(w => `<option value="${w}" ${w===week ? "selected" : ""}>Week ${w}</option>`).join("")}
              </select>
            </label>
          </div>
          <div class="grid stacked">
            ${weekGames.map(game => `
              <div class="card nested game-edit" data-game-id="${esc(game.id)}">
                <div class="row between">
                  <strong>${esc(game.home)} vs ${esc(game.away)}</strong>
                  <span class="pill">${esc(game.id)}</span>
                </div>
                <div class="form-grid compact">
                  <label>Home Score<input class="input" type="number" data-field="homeScore" value="${game.homeScore ?? ""}"></label>
                  <label>Away Score<input class="input" type="number" data-field="awayScore" value="${game.awayScore ?? ""}"></label>
                  <label>Status
                    <select class="select" data-field="status">
                      <option value="upcoming" ${game.status === "upcoming" ? "selected" : ""}>Upcoming</option>
                      <option value="live" ${game.status === "live" ? "selected" : ""}>Live</option>
                      <option value="final" ${game.status === "final" ? "selected" : ""}>Final</option>
                    </select>
                  </label>
                  <label>Time / Note<input class="input" data-field="time" value="${esc(game.time || "")}"></label>
                  <label>Note<input class="input" data-field="note" value="${esc(game.note || "")}"></label>
                </div>
              </div>
            `).join("")}
          </div>
          <div class="row right"><button class="btn primary" onclick="NTFL.saveGames()">Apply Game Changes</button></div>
        </div>

        <div class="card" id="team-editor">
          <div class="section-head"><div><h2>Team rundown</h2><p class="muted">Edit coach names, colors, abbreviation, and notes.</p></div></div>
          <label>Team
            <select class="select" onchange="NTFL.setAdminTeam(this.value)">
              ${teams.map(t => `<option value="${t.slug}" ${selectedTeam?.slug===t.slug ? "selected" : ""}>${esc(t.name)}</option>`).join("")}
            </select>
          </label>
          <div class="form-grid">
            <label>Abbreviation<input class="input" name="abbr" value="${esc(selectedTeam?.abbr || "")}"></label>
            <label>Primary Color<input class="input" name="primaryColor" value="${esc(selectedTeam?.primaryColor || "")}"></label>
            <label>Secondary Color<input class="input" name="secondaryColor" value="${esc(selectedTeam?.secondaryColor || "")}"></label>
            <label>Head Coach<input class="input" name="headCoach" value="${esc(selectedTeam?.headCoach || "")}"></label>
            <label>Assistant Coach<input class="input" name="assistantCoach" value="${esc(selectedTeam?.assistantCoach || "")}"></label>
          </div>
          <label>Notes<textarea class="textarea" name="notes" rows="6">${esc(selectedTeam?.notes || "")}</textarea></label>
          <div class="row right"><button class="btn primary" onclick="NTFL.saveTeam()">Save Team</button></div>
        </div>
      </div>

      <div class="admin-col">
        <div class="card">
          <div class="section-head"><div><h2>Rankings</h2><p class="muted">Drag and drop to reorder the public list.</p></div></div>
          <div class="rank-list" id="rankList">
            ${state.data.rankings.map((r, idx) => `
              <div class="rank-item" draggable="true" data-rank-index="${idx}" ondragstart="NTFL.dragRankStart(event, ${idx})" ondragover="NTFL.dragRankOver(event)" ondrop="NTFL.dropRank(event, ${idx})">
                <div class="drag-handle">☰</div>
                <div class="rank-meta">
                  <strong>#${idx + 1} ${esc(r.team)}</strong>
                  <span>${esc(r.record)} • ${esc(r.division)} • ${r.pointDiff >= 0 ? "+" : ""}${r.pointDiff} diff</span>
                </div>
                <div class="rank-actions">
                  <button class="mini-btn" onclick="NTFL.moveRank(${idx}, -1); return false;">↑</button>
                  <button class="mini-btn" onclick="NTFL.moveRank(${idx}, 1); return false;">↓</button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="card" id="awards-editor">
          <div class="section-head"><div><h2>Awards</h2><p class="muted">Edit league honors.</p></div></div>
          <div class="grid stacked">
            ${state.data.awards.map((a, idx) => `
              <div class="card nested" data-award-row="${idx}">
                <div class="form-grid compact">
                  <label>Category<input class="input" data-field="category" value="${esc(a.category || "")}"></label>
                  <label>Winner<input class="input" data-field="winner" value="${esc(a.winner || "")}"></label>
                  <label>Team<input class="input" data-field="team" value="${esc(a.team || "")}"></label>
                </div>
              </div>
            `).join("")}
          </div>
          <div class="row between">
            <button class="btn" onclick="NTFL.addAward()">Add Award Row</button>
            <button class="btn primary" onclick="NTFL.saveAwards()">Save Awards</button>
          </div>
        </div>

        <div class="card" id="history-editor">
          <div class="section-head"><div><h2>History</h2><p class="muted">Past champions and league archive.</p></div></div>
          <div class="grid stacked">
            ${state.data.history.map((h, idx) => `
              <div class="card nested" data-history-row="${idx}">
                <div class="form-grid compact">
                  <label>Season<input class="input" data-field="season" value="${esc(h.season || "")}"></label>
                  <label>Champion<input class="input" data-field="champion" value="${esc(h.champion || "")}"></label>
                  <label>Record<input class="input" data-field="record" value="${esc(h.record || "")}"></label>
                  <label>Notes<input class="input" data-field="notes" value="${esc(h.notes || "")}"></label>
                </div>
              </div>
            `).join("")}
          </div>
          <div class="row between">
            <button class="btn" onclick="NTFL.addHistory()">Add History Row</button>
            <button class="btn primary" onclick="NTFL.saveHistory()">Save History</button>
          </div>
        </div>

        <div class="card" id="hof-editor">
          <div class="section-head"><div><h2>Hall of Fame</h2><p class="muted">Special honors.</p></div></div>
          <div class="grid stacked">
            ${state.data.hallOfFame.map((h, idx) => `
              <div class="card nested" data-hof-row="${idx}">
                <div class="form-grid compact">
                  <label>Name<input class="input" data-field="name" value="${esc(h.name || "")}"></label>
                  <label>Team<input class="input" data-field="team" value="${esc(h.team || "")}"></label>
                  <label>Honor<input class="input" data-field="honor" value="${esc(h.honor || "")}"></label>
                  <label>Notes<input class="input" data-field="notes" value="${esc(h.notes || "")}"></label>
                </div>
              </div>
            `).join("")}
          </div>
          <div class="row between">
            <button class="btn" onclick="NTFL.addHOF()">Add HOF Row</button>
            <button class="btn primary" onclick="NTFL.saveHOF()">Save HOF</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
function render() {
  state.route = routeFromHash();
  let body = "";
  switch (state.route.page) {
    case "home": body = homePage(); break;
    case "teams": body = teamsPage(); break;
    case "team": body = teamPage(); break;
    case "schedule": body = schedulePage(); break;
    case "standings": body = standingsPage(); break;
    case "rankings": body = rankingsPage(); break;
    case "awards": body = awardsPage(); break;
    case "history": body = historyPage(); break;
    case "hof":
    case "hall-of-fame": body = hofPage(); break;
    case "admin": body = adminPage(); break;
    default: body = `<div class="card empty">Page not found.</div>`;
  }
  app.innerHTML = `
    <div class="shell">
      ${headerHTML()}
      <main class="container main-content">${body}</main>
      ${footerHTML()}
    </div>
  `;
  document.title = `${state.data.site.name} • ${state.route.page[0].toUpperCase() + state.route.page.slice(1)}`;
}

window.NTFL = {
  setTeamTab,
  searchTeams: setSearch,
  setAdminWeek,
  setAdminDivision,
  setAdminTeam,
  setStatusFilter,
  login,
  logout,
  saveSite,
  saveGames,
  saveTeam,
  saveAwards,
  saveHistory,
  saveHOF,
  saveAllDraft,
  download: downloadJSON,
  publishPublic,
  addAward,
  addHistory,
  addHOF,
  moveRank,
  dragRankStart,
  dragRankOver,
  dropRank
};

window.addEventListener("hashchange", render);

(async function init() {
  state.data = await loadData();
  state.ui.adminWeek = currentWeek();
  state.ui.adminDivision = teamsArray()[0]?.division || "";
  state.ui.adminTeam = teamsArray()[0]?.slug || "";
  state.ui.week = currentWeek();
  if (!location.hash) location.hash = "#/home";
  render();
})();
