
const STORAGE_KEY = "ntfl-site-draft";
const AUTH_KEY = "ntfl-admin-auth";
const DATA_URL = "data/site-data.json?v=" + Date.now();
const DEMO_USER = "demo";
const DEMO_PASS = "demo123";

const state = {
  data: null,
  route: { page: "home", slug: "" },
  ui: {
    search: "",
    teamTabs: {},
    adminDivision: "",
    adminWeek: 1,
    adminTeam: "",
    adminRankDrag: null,
  }
};

const app = document.getElementById("app");

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}
function slugify(v) {
  return String(v ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function clone(v) {
  return JSON.parse(JSON.stringify(v));
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
function loadLogoSrc() {
  return "assets/IMG_5900.png";
}
function teamLookup(data = state.data) {
  return data?.teams || {};
}
function teamsArray(data = state.data) {
  return Object.values(teamLookup(data));
}
function currentWeek() {
  return Number(state.data?.site?.currentWeek || 1);
}
function currentSeason() {
  return state.data?.site?.season || "Season";
}
function statusLabel(status) {
  if (status === "final") return "FINAL";
  if (status === "live") return "LIVE";
  return "UPCOMING";
}
function resultLabel(game) {
  if (!Number.isFinite(game.scoreFor) || !Number.isFinite(game.scoreAgainst)) {
    return game.status === "live" ? "LIVE" : "TBD";
  }
  if (game.scoreFor > game.scoreAgainst) return "W";
  if (game.scoreFor < game.scoreAgainst) return "L";
  return "T";
}
function weekNum(label) {
  const n = Number(String(label ?? "").replace(/\D+/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function hashColor(input) {
  const s = slugify(input);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 75% 56%), hsl(${(hue + 36) % 360} 62% 22%))`;
}
function routeFromHash() {
  const hash = location.hash.replace(/^#\/?/, "");
  if (!hash) return { page: "home", slug: "" };
  const parts = hash.split("/").filter(Boolean);
  if (!parts.length) return { page: "home", slug: "" };
  return { page: parts[0], slug: parts.slice(1).join("/") };
}
function navigate(page, slug = "") {
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
function parseGameStatus(g) {
  return g.status || (g.played ? "final" : (g.live ? "live" : "upcoming"));
}
function gameTeamSlug(name) {
  return slugify(name);
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
  const scheduleByTeam = {};

  (data.games || []).forEach(game => {
    const status = parseGameStatus(game);
    game.status = status;
    game.played = status === "final";
    const homeSlug = gameTeamSlug(game.home);
    const awaySlug = gameTeamSlug(game.away);
    const week = Number(game.weekNumber || weekNum(game.week) || 0);
    const weekLabel = game.week || `W${week || ""}`.trim();
    const scoreHome = Number.isFinite(Number(game.homeScore)) ? Number(game.homeScore) : null;
    const scoreAway = Number.isFinite(Number(game.awayScore)) ? Number(game.awayScore) : null;
    const displayRaw = game.raw || (status === "final" && scoreHome !== null && scoreAway !== null ? `vs ${game.away} (${scoreHome}-${scoreAway})` : `vs ${game.away || "TBD"}`);
    game.raw = displayRaw;
    game.time = game.time || (status === "upcoming" ? "TBD" : (status === "live" ? "LIVE" : ""));
    game.weekLabel = weekLabel;

    const homeEntry = {
      week,
      weekLabel,
      opponent: game.away,
      raw: game.home ? `vs ${game.away}${scoreHome !== null && scoreAway !== null ? ` (${scoreHome}-${scoreAway})` : ""}` : `@ ${game.away}`,
      home: true,
      played: status === "final",
      scoreFor: scoreHome,
      scoreAgainst: scoreAway,
      result: status === "final" ? (scoreHome > scoreAway ? "W" : scoreHome < scoreAway ? "L" : "T") : (status === "live" ? "LIVE" : null),
      status
    };
    const awayEntry = {
      week,
      weekLabel,
      opponent: game.home,
      raw: game.away ? `@ ${game.home}${scoreHome !== null && scoreAway !== null ? ` (${scoreAway}-${scoreHome})` : ""}` : `vs ${game.home}`,
      home: false,
      played: status === "final",
      scoreFor: scoreAway,
      scoreAgainst: scoreHome,
      result: status === "final" ? (scoreAway > scoreHome ? "W" : scoreAway < scoreHome ? "L" : "T") : (status === "live" ? "LIVE" : null),
      status
    };

    if (bySlug[homeSlug]) {
      scheduleByTeam[homeSlug] = scheduleByTeam[homeSlug] || [];
      scheduleByTeam[homeSlug].push(homeEntry);
      if (status === "final" && scoreHome !== null && scoreAway !== null) {
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
      scheduleByTeam[awaySlug] = scheduleByTeam[awaySlug] || [];
      scheduleByTeam[awaySlug].push(awayEntry);
      if (status === "final" && scoreHome !== null && scoreAway !== null) {
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
    team.pointDiff = team.pointsFor - team.pointsAgainst;
    team.ppg = team.gamesPlayed ? team.pointsFor / team.gamesPlayed : 0;
    team.oppg = team.gamesPlayed ? team.pointsAgainst / team.gamesPlayed : 0;
    team.schedule = (scheduleByTeam[team.slug] || []).sort((a, b) => a.week - b.week || a.weekLabel.localeCompare(b.weekLabel));
    const finals = (finalsByTeam[team.slug] || []).sort((a, b) => a.week - b.week || a.weekLabel.localeCompare(b.weekLabel));
    team.last5 = finals.slice(-5).reverse();
    if (finals.length) {
      const end = finals[finals.length - 1];
      const target = end.result;
      let count = 0;
      for (let i = finals.length - 1; i >= 0; i--) {
        if (finals[i].result !== target) break;
        count++;
      }
      team.streak = `${target}${count}`;
    } else {
      team.streak = "—";
    }
    team.divisionName = team.division || team.divisionName || "";
  });

  data.standings = Object.values(bySlug)
    .map(team => ({
      rank: 0,
      slug: team.slug,
      team: team.name,
      division: team.divisionName || team.division || "",
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
    .map((row, i) => ({ ...row, rank: i + 1 }));

  // keep rankings in manual order but refresh stat fields
  const statsBySlug = Object.fromEntries(data.standings.map(s => [s.slug, s]));
  if (Array.isArray(data.rankings)) {
    data.rankings = [...data.rankings]
      .sort((a, b) => Number(a.rank || 999) - Number(b.rank || 999))
      .map((r, idx) => {
        const stats = statsBySlug[r.slug || slugify(r.team)] || {};
        return {
          ...r,
          rank: idx + 1,
          slug: r.slug || slugify(r.team),
          team: r.team || stats.team || "",
          division: r.division || stats.division || "",
          record: stats.record || r.record || "0-0",
          pointsFor: stats.pointsFor ?? r.pointsFor ?? 0,
          pointsAgainst: stats.pointsAgainst ?? r.pointsAgainst ?? 0,
          pointDiff: stats.pointDiff ?? r.pointDiff ?? 0,
          ppg: stats.ppg ?? r.ppg ?? 0,
          oppg: stats.oppg ?? r.oppg ?? 0
        };
      });
  }

  return data;
}

function normalizeData(input) {
  const data = clone(input || {});
  data.site = Object.assign({
    name: "NTFL",
    season: "Season 3",
    currentWeek: 1,
    subtitle: "Modern editable league hub",
    version: "paragon-modern-fix-2",
    lastUpdated: new Date().toISOString().slice(0, 10)
  }, data.site || {});
  data.divisions = Array.isArray(data.divisions) ? data.divisions : [];
  data.games = Array.isArray(data.games) ? data.games : [];
  data.rankings = Array.isArray(data.rankings) ? data.rankings : [];
  data.awards = Array.isArray(data.awards) ? data.awards : [];
  data.history = Array.isArray(data.history) ? data.history : [];
  data.hallOfFame = Array.isArray(data.hallOfFame) ? data.hallOfFame : [];
  data.teams = data.teams && !Array.isArray(data.teams) ? data.teams : {};

  Object.values(data.teams).forEach(team => {
    team.name = team.name || team.slug || "";
    team.slug = team.slug || slugify(team.name);
    team.divisionName = team.divisionName || team.division || "";
    team.headCoach = team.headCoach || "TBD";
    team.assistantCoach = team.assistantCoach || "TBD";
    team.notes = team.notes || "Add a short team rundown here from the admin dashboard.";
  });

  rebuildDerived(data);

  return data;
}

async function loadData() {
  const draft = loadDraft();
  if (draft) {
    try { return normalizeData(draft); } catch {}
  }
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load data");
  return normalizeData(await res.json());
}

function saveToBrowser() {
  saveDraft(state.data);
}

function downloadJSON() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "data.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function teamBySlug(slug) {
  return state.data?.teams?.[slug];
}
function divisionBySlug(slug) {
  return state.data?.divisions?.find(d => d.slug === slug);
}
function selectedTeam() {
  return teamBySlug(state.route.slug);
}
function teamStatCards(team) {
  return `
    <div class="stat-card"><span>Record</span><strong>${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""}</strong></div>
    <div class="stat-card"><span>Points For</span><strong>${team.pointsFor}</strong></div>
    <div class="stat-card"><span>Points Against</span><strong>${team.pointsAgainst}</strong></div>
    <div class="stat-card"><span>PPG</span><strong>${team.ppg.toFixed(1)}</strong></div>
    <div class="stat-card"><span>OPPG</span><strong>${team.oppg.toFixed(1)}</strong></div>
    <div class="stat-card"><span>Diff</span><strong>${team.pointDiff >= 0 ? "+" : ""}${team.pointDiff}</strong></div>
  `;
}
function teamBadge(name) {
  const parts = String(name || "").split(/\s+/).filter(Boolean);
  const text = parts.slice(0, 2).map(p => p[0]).join("").toUpperCase();
  return text || "NT";
}
function gameStatusPill(game) {
  const status = parseGameStatus(game);
  if (status === "final") return `<span class="pill good">FINAL</span>`;
  if (status === "live") return `<span class="pill live">LIVE</span>`;
  return `<span class="pill">${esc(game.time || "UPCOMING")}</span>`;
}
function gameScoreText(game) {
  const status = parseGameStatus(game);
  const a = Number.isFinite(game.homeScore) ? game.homeScore : "—";
  const b = Number.isFinite(game.awayScore) ? game.awayScore : "—";
  if (status === "final") return `${a} - ${b}`;
  if (status === "live") return `LIVE ${a} - ${b}`;
  return game.time || "Scheduled";
}
function gameCard(game) {
  const home = state.data.teams[gameTeamSlug(game.home)] || { name: game.home, slug: gameTeamSlug(game.home) };
  const away = state.data.teams[gameTeamSlug(game.away)] || { name: game.away, slug: gameTeamSlug(game.away) };
  const status = parseGameStatus(game);
  const homeScore = Number.isFinite(game.homeScore) ? game.homeScore : null;
  const awayScore = Number.isFinite(game.awayScore) ? game.awayScore : null;
  const winnerSlug = status === "final" && homeScore !== null && awayScore !== null ? (homeScore > awayScore ? home.slug : away.slug) : "";
  return `
    <div class="card game-card ${status}">
      <div class="row between">
        <div class="row tight">
          <span class="pill">${esc(game.weekLabel || `W${game.weekNumber || ""}`)}</span>
          ${gameStatusPill(game)}
        </div>
        <span class="muted tiny">${esc(game.division || "")}</span>
      </div>
      <div class="game-teams">
        <a class="game-team ${winnerSlug === home.slug ? "winner" : ""}" href="#/team/${home.slug}">
          <span class="badge" style="background:${hashColor(home.name)}">${teamBadge(home.name)}</span>
          <span>
            <strong>${esc(home.name)}</strong>
            <small>${game.home === home.name ? "Home" : ""}</small>
          </span>
        </a>
        <div class="game-score ${status}">${esc(gameScoreText(game))}</div>
        <a class="game-team ${winnerSlug === away.slug ? "winner" : ""}" href="#/team/${away.slug}">
          <span class="badge" style="background:${hashColor(away.name)}">${teamBadge(away.name)}</span>
          <span>
            <strong>${esc(away.name)}</strong>
            <small>${game.away === away.name ? "Away" : ""}</small>
          </span>
        </a>
      </div>
    </div>
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
          ${rows.slice(0, limit).map(r => `
            <tr>
              <td>${r.rank}</td>
              <td><a href="#/team/${r.slug}">${esc(r.team)}</a></td>
              <td>${esc(r.division)}</td>
              <td><strong>${esc(r.record)}</strong></td>
              <td>${r.pointsFor}</td>
              <td>${r.pointsAgainst}</td>
              <td class="${r.pointDiff >= 0 ? "good" : "bad"}">${r.pointDiff >= 0 ? "+" : ""}${r.pointDiff}</td>
              <td>${r.ppg.toFixed ? r.ppg.toFixed(1) : Number(r.ppg).toFixed(1)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}
function homePage() {
  const featured = (state.data.games || []).filter(g => Number(g.weekNumber) === currentWeek()).slice(0, 4);
  const top = (state.data.standings || []).slice(0, 4);
  const rankTop = (state.data.rankings || []).slice(0, 6);
  const liveCount = (state.data.games || []).filter(g => parseGameStatus(g) === "live" && Number(g.weekNumber) === currentWeek()).length;
  return `
    <section class="hero">
      <div class="hero-card">
        <div class="hero-logo">
          <img src="${loadLogoSrc()}" alt="NTFL logo" onerror="this.src='assets/logo.svg'">
        </div>
        <div class="hero-copy">
          <span class="eyebrow">${esc(state.data.site.season)} • Week ${currentWeek()} • ${esc(state.data.site.version)}</span>
          <h1>${esc(state.data.site.name)}</h1>
          <p>${esc(state.data.site.subtitle || "Modern editable league hub for teams, scores, rankings, awards, and history.")}</p>
          <div class="hero-actions">
            <a class="btn primary" href="#/teams">Browse Teams</a>
            <a class="btn" href="#/schedule">View Schedule</a>
            <a class="btn" href="#/standings">Standings</a>
          </div>
        </div>
      </div>
    </section>

    <section class="grid stats-grid">
      <div class="stat-card"><span>Teams</span><strong>${Object.keys(state.data.teams || {}).length}</strong></div>
      <div class="stat-card"><span>Current Week</span><strong>${currentWeek()}</strong></div>
      <div class="stat-card"><span>Live Games</span><strong>${liveCount}</strong></div>
      <div class="stat-card"><span>Top Team</span><strong>${top[0] ? esc(top[0].team) : "—"}</strong></div>
    </section>

    <section class="section-grid">
      <div class="section-head">
        <h2>Featured Week ${currentWeek()} Games</h2>
        <a href="#/schedule">See all</a>
      </div>
      <div class="grid cards-2">${featured.map(gameCard).join("") || `<div class="card empty">No games found for this week.</div>`}</div>
    </section>

    <section class="section-grid two-col">
      <div>
        <div class="section-head">
          <h2>Standings Preview</h2>
          <a href="#/standings">Full table</a>
        </div>
        ${standingsTable(top, 4)}
      </div>
      <div>
        <div class="section-head">
          <h2>Power Rankings</h2>
          <a href="#/rankings">Full rankings</a>
        </div>
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
      <div class="section-head">
        <h2>Quick Team Access</h2>
        <a href="#/teams">All teams</a>
      </div>
      <div class="grid team-grid">
        ${(teamsArray().slice(0, 8)).map(team => `
          <a class="team-card" href="#/team/${team.slug}">
            <div class="team-badge" style="background:${hashColor(team.name)}">${teamBadge(team.name)}</div>
            <div>
              <strong>${esc(team.name)}</strong>
              <span>${esc(team.divisionName || team.division || "")}</span>
              <small>${esc(team.wins)}-${esc(team.losses)}${team.ties ? `-${team.ties}` : ""}</small>
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
    const s = `${t.name} ${t.divisionName || t.division || ""} ${t.headCoach || ""} ${t.assistantCoach || ""}`.toLowerCase();
    return !search || s.includes(search);
  });
  const divisions = [...new Set(teamsArray().map(t => t.divisionName || t.division || "").filter(Boolean))];
  return `
    <section class="page-head">
      <div>
        <span class="eyebrow">League</span>
        <h1>Teams</h1>
        <p>Click any team for a full rundown, schedule, coaches, and PPG.</p>
      </div>
      <div class="page-tools">
        <input class="search" type="search" placeholder="Search teams or coaches" value="${esc(state.ui.search)}" oninput="NTFL.searchTeams(this.value)">
      </div>
    </section>
    <div class="chip-row">
      <button class="chip ${state.ui.search ? "" : "active"}" onclick="NTFL.searchTeams('')">All</button>
      ${divisions.map(d => `<button class="chip" onclick="NTFL.searchTeams('${esc(d)}')">${esc(d)}</button>`).join("")}
    </div>
    <section class="grid team-grid large">
      ${teams.map(team => `
        <a class="team-card large" href="#/team/${team.slug}">
          <div class="team-badge large" style="background:${hashColor(team.name)}">${teamBadge(team.name)}</div>
          <div class="team-info">
            <strong>${esc(team.name)}</strong>
            <span>${esc(team.divisionName || team.division || "")}</span>
            <small>${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""} • PPG ${Number(team.ppg).toFixed(1)}</small>
            <small>${esc(team.headCoach || "TBD")}${team.assistantCoach ? ` • ${esc(team.assistantCoach)}` : ""}</small>
          </div>
        </a>
      `).join("")}
    </section>
  `;
}

function teamPage() {
  const team = selectedTeam();
  if (!team) return `<div class="card empty">Team not found.</div>`;
  const tab = state.ui.teamTabs[team.slug] || "overview";
  const schedule = team.schedule || [];
  const recent = team.last5 || [];
  const content = {
    overview: `
      <div class="grid stats-grid">${teamStatCards(team)}</div>
      <div class="grid two-col">
        <div class="card">
          <h3>Season Snapshot</h3>
          <p class="muted">This page updates automatically from the schedule. Final games count toward the record and PPG.</p>
          <div class="grid stacked">
            ${recent.length ? recent.map(g => `
              <div class="mini-row">
                <div class="mini-rank ${g.result === "W" ? "good" : g.result === "L" ? "bad" : ""}">${g.result || "—"}</div>
                <div class="mini-body">
                  <strong>${esc(g.weekLabel)} vs ${esc(g.opponent)}</strong>
                  <span>${g.scoreFor ?? "—"} - ${g.scoreAgainst ?? "—"}</span>
                </div>
              </div>
            `).join("") : `<div class="empty">No completed games yet.</div>`}
          </div>
        </div>
        <div class="card">
          <h3>Rundown</h3>
          <div class="notes-box">${esc(team.notes || "No notes yet.")}</div>
        </div>
      </div>
    `,
    schedule: `
      <div class="grid stacked">
        ${schedule.map(g => `
          <div class="card schedule-row ${g.status}">
            <div class="row between">
              <div class="row tight">
                <span class="pill">${esc(g.weekLabel)}</span>
                <span class="pill ${g.status}">${esc(statusLabel(g.status))}</span>
              </div>
              <span class="muted">${esc(g.raw || "")}</span>
            </div>
            <div class="game-teams compact">
              <div class="game-team compact ${g.result === "W" && g.home ? "winner" : ""}">
                <strong>${g.home ? "vs" : "@"} ${esc(g.opponent)}</strong>
              </div>
              <div class="game-score ${g.status}">${esc(gameScoreText({ ...g, homeScore: g.scoreFor, awayScore: g.scoreAgainst, status: g.status }))}</div>
              <div class="game-team compact ${g.result === "W" && !g.home ? "winner" : ""}">
                <strong>${g.home ? "Home" : "Away"}</strong>
              </div>
            </div>
          </div>
        `).join("") || `<div class="card empty">No schedule available.</div>`}
      </div>
    `,
    ppg: `
      <div class="grid stats-grid">
        <div class="stat-card"><span>Offense PPG</span><strong>${team.ppg.toFixed(1)}</strong></div>
        <div class="stat-card"><span>Defense PPG</span><strong>${team.oppg.toFixed(1)}</strong></div>
        <div class="stat-card"><span>Point Diff</span><strong>${team.pointDiff >= 0 ? "+" : ""}${team.pointDiff}</strong></div>
        <div class="stat-card"><span>Games Played</span><strong>${team.gamesPlayed}</strong></div>
      </div>
      <div class="card">
        <h3>PPG Breakdown</h3>
        <div class="bar-row"><span>Offense</span><div class="bar"><div style="width:${Math.min(100, (team.ppg / 50) * 100)}%"></div></div><strong>${team.ppg.toFixed(1)}</strong></div>
        <div class="bar-row"><span>Defense</span><div class="bar"><div style="width:${Math.min(100, (team.oppg / 50) * 100)}%"></div></div><strong>${team.oppg.toFixed(1)}</strong></div>
      </div>
    `,
    coaches: `
      <div class="grid cols-2">
        <div class="card">
          <h3>Head Coach</h3>
          <p class="coach-tag">${esc(team.headCoach || "TBD")}</p>
        </div>
        <div class="card">
          <h3>Assistant Coach</h3>
          <p class="coach-tag">${esc(team.assistantCoach || "TBD")}</p>
        </div>
      </div>
    `,
    notes: `
      <div class="card">
        <h3>Team Notes</h3>
        <div class="notes-box">${esc(team.notes || "No notes yet.")}</div>
      </div>
    `
  }[tab] || content.overview;

  return `
    <section class="page-head team-head">
      <div class="team-hero">
        <div class="team-badge large" style="background:${hashColor(team.name)}">${teamBadge(team.name)}</div>
        <div>
          <span class="eyebrow">${esc(team.divisionName || team.division || "")}</span>
          <h1>${esc(team.name)}</h1>
          <p>${esc(team.headCoach || "TBD")}${team.assistantCoach ? ` • ${esc(team.assistantCoach)}` : ""}</p>
        </div>
      </div>
      <div class="page-tools">
        <span class="pill">${esc(team.wins)}-${esc(team.losses)}${team.ties ? `-${team.ties}` : ""}</span>
        <span class="pill">PPG ${team.ppg.toFixed(1)}</span>
      </div>
    </section>

    <div class="tabs">
      ${["overview","schedule","ppg","coaches","notes"].map(t => `<button class="tab ${tab===t?"active":""}" onclick="NTFL.setTeamTab('${team.slug}','${t}')">${t.toUpperCase()}</button>`).join("")}
    </div>

    <section class="section-grid">${content}</section>
  `;
}

function schedulePage() {
  const weeks = [...new Set((state.data.games || []).map(g => Number(g.weekNumber || weekNum(g.week) || 0)).filter(Boolean))].sort((a,b) => a-b);
  const week = state.ui.adminWeek || currentWeek();
  const games = (state.data.games || [])
    .filter(g => Number(g.weekNumber || weekNum(g.week) || 0) === week)
    .sort((a,b) => (a.division || "").localeCompare(b.division || "") || (a.home || "").localeCompare(b.home || ""));
  return `
    <section class="page-head">
      <div>
        <span class="eyebrow">League</span>
        <h1>Schedule</h1>
        <p>Updated game cards with live / final / upcoming status.</p>
      </div>
      <div class="page-tools">
        <select class="select" onchange="NTFL.setAdminWeek(this.value)">
          ${weeks.map(w => `<option value="${w}" ${w===week ? "selected" : ""}>Week ${w}</option>`).join("")}
        </select>
      </div>
    </section>
    <div class="grid stacked">${games.map(gameCard).join("") || `<div class="card empty">Schedule not found.</div>`}</div>
  `;
}

function standingsPage() {
  const rows = state.data.standings || [];
  const divisions = [...new Set(rows.map(r => r.division).filter(Boolean))];
  const filter = state.ui.search && divisions.includes(state.ui.search) ? state.ui.search : "All";
  const filtered = filter === "All" ? rows : rows.filter(r => r.division === filter);
  return `
    <section class="page-head">
      <div>
        <span class="eyebrow">League</span>
        <h1>Standings</h1>
        <p>Automatically recalculated from final scores.</p>
      </div>
    </section>
    <div class="chip-row">
      <button class="chip ${filter==="All" ? "active" : ""}" onclick="NTFL.searchTeams('')">All</button>
      ${divisions.map(d => `<button class="chip ${filter===d ? "active" : ""}" onclick="NTFL.searchTeams('${esc(d)}')">${esc(d)}</button>`).join("")}
    </div>
    ${standingsTable(filtered, filtered.length)}
  `;
}

function rankingsPage() {
  const rows = state.data.rankings || [];
  return `
    <section class="page-head">
      <div>
        <span class="eyebrow">League</span>
        <h1>Rankings</h1>
        <p>Manual order, stored in the dashboard and shown publicly.</p>
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
        <span class="eyebrow">Archive</span>
        <h1>Awards</h1>
        <p>Editable league awards and honors.</p>
      </div>
    </section>
    <div class="grid cols-2">
      ${(state.data.awards || []).map(a => `
        <div class="card">
          <h3>${esc(a.category || a.name || "Award")}</h3>
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
        <span class="eyebrow">Archive</span>
        <h1>History</h1>
        <p>Season archive, champions, and notes.</p>
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
      `).join("") || `<div class="card empty">No history added yet.</div>`}
    </div>
  `;
}

function hofPage() {
  return `
    <section class="page-head">
      <div>
        <span class="eyebrow">Archive</span>
        <h1>Hall of Fame</h1>
        <p>League legends and special honors.</p>
      </div>
    </section>
    <div class="grid cols-2">
      ${(state.data.hallOfFame || []).map(item => `
        <div class="card">
          <h3>${esc(item.name || "Honoree")}</h3>
          <p>${esc(item.team || "")}</p>
          <p class="muted">${esc(item.notes || item.honor || "")}</p>
        </div>
      `).join("") || `<div class="card empty">No Hall of Fame entries yet.</div>`}
    </div>
  `;
}

function adminLoginPage() {
  return `
    <section class="hero">
      <div class="hero-card">
        <div class="hero-logo"><img src="${loadLogoSrc()}" alt="NTFL logo" onerror="this.src='assets/logo.svg'"></div>
        <div class="hero-copy">
          <span class="eyebrow">Admin access</span>
          <h1>Login</h1>
          <p>Private editing access for NTFL admins.</p>
          <form class="login-form" onsubmit="NTFL.login(event)">
            <input class="input" type="text" name="username" placeholder="Username" autocomplete="username" required>
            <input class="input" type="password" name="password" placeholder="Password" autocomplete="current-password" required>
            <button class="btn primary" type="submit">Sign in</button>
          </form>
        </div>
      </div>
    </section>
  `;
}

function adminSectionTitle(title, desc) {
  return `<div class="section-head"><div><h2>${esc(title)}</h2><p class="muted">${esc(desc || "")}</p></div></div>`;
}

function adminPage() {
  if (!isAuthed()) return adminLoginPage();
  const divisions = state.data.divisions || [];
  const teams = teamsArray();
  if (!state.ui.adminDivision && divisions[0]) state.ui.adminDivision = divisions[0].slug;
  if (!state.ui.adminTeam && teams[0]) state.ui.adminTeam = teams[0].slug;
  if (!state.ui.adminWeek) state.ui.adminWeek = currentWeek();
  const div = divisionBySlug(state.ui.adminDivision) || divisions[0];
  const week = Number(state.ui.adminWeek || currentWeek());
  const games = (state.data.games || []).filter(g => (g.divisionSlug || slugify(g.division)) === (div?.slug || ""));
  const gameWeeks = [...new Set(games.map(g => Number(g.weekNumber || weekNum(g.week) || 0)).filter(Boolean))].sort((a,b)=>a-b);
  const weekGames = games.filter(g => Number(g.weekNumber || weekNum(g.week) || 0) === week);
  const selectedTeam = teamBySlug(state.ui.adminTeam) || teams[0];

  return `
    <section class="page-head admin-head">
      <div>
        <span class="eyebrow">Admin</span>
        <h1>Dashboard</h1>
        <p>Update games, scores, live status, rankings, awards, history, and team rundowns.</p>
      </div>
      <div class="page-tools">
        <button class="btn" onclick="NTFL.download()">Download data.json</button>
        <button class="btn" onclick="NTFL.saveBrowser()">Save Draft</button>
        <button class="btn danger" onclick="NTFL.logout()">Logout</button>
      </div>
    </section>

    <div class="grid admin-grid">
      <div class="admin-col">
        <div class="card" id="site-editor">
          ${adminSectionTitle("Site settings", "League name, season, current week, and subtitle.")}
          <div class="form-grid">
            <label>League Name<input class="input" name="siteName" value="${esc(state.data.site.name || "")}"></label>
            <label>Season<input class="input" name="siteSeason" value="${esc(state.data.site.season || "")}"></label>
            <label>Current Week<input class="input" type="number" min="1" name="siteWeek" value="${esc(state.data.site.currentWeek || 1)}"></label>
            <label>Subtitle<input class="input" name="siteSubtitle" value="${esc(state.data.site.subtitle || "")}"></label>
          </div>
          <div class="row right">
            <button class="btn primary" onclick="NTFL.saveSite()">Save Site Settings</button>
          </div>
        </div>

        <div class="card" id="games-editor">
          ${adminSectionTitle("Games", "Change scores, status, and time. Final scores update standings and PPG automatically.")}
          <div class="form-grid compact">
            <label>Division
              <select class="select" id="adminDivision" onchange="NTFL.setAdminDivision(this.value)">
                ${(divisions || []).map(d => `<option value="${esc(d.slug)}" ${div?.slug===d.slug ? "selected" : ""}>${esc(d.name)}</option>`).join("")}
              </select>
            </label>
            <label>Week
              <select class="select" id="adminWeek" onchange="NTFL.setAdminWeek(this.value)">
                ${gameWeeks.map(w => `<option value="${w}" ${w===week ? "selected" : ""}>Week ${w}</option>`).join("")}
              </select>
            </label>
          </div>
          <div id="gamesEditorList" class="grid stacked">
            ${weekGames.length ? weekGames.map(game => `
              <div class="card nested game-edit" data-game-id="${esc(game.id)}">
                <div class="row between">
                  <div>
                    <strong>${esc(game.home)} vs ${esc(game.away)}</strong>
                    <p class="muted">${esc(game.weekLabel || game.week || "")} • ${esc(game.division || "")}</p>
                  </div>
                  <span class="pill">${esc(game.id)}</span>
                </div>
                <div class="form-grid compact">
                  <label>Home Score<input class="input" type="number" data-field="homeScore" value="${game.homeScore ?? ""}"></label>
                  <label>Away Score<input class="input" type="number" data-field="awayScore" value="${game.awayScore ?? ""}"></label>
                  <label>Status
                    <select class="select" data-field="status">
                      <option value="upcoming" ${parseGameStatus(game)==="upcoming" ? "selected" : ""}>Upcoming</option>
                      <option value="live" ${parseGameStatus(game)==="live" ? "selected" : ""}>Live</option>
                      <option value="final" ${parseGameStatus(game)==="final" ? "selected" : ""}>Final</option>
                    </select>
                  </label>
                  <label>Time / Note<input class="input" data-field="time" value="${esc(game.time || "")}"></label>
                </div>
              </div>
            `).join("") : `<div class="empty card">No games for this division/week.</div>`}
          </div>
          <div class="row right">
            <button class="btn primary" onclick="NTFL.saveGames()">Apply Game Changes</button>
          </div>
        </div>

        <div class="card" id="team-editor">
          ${adminSectionTitle("Team rundown", "Edit coach names and team notes.")}
          <label>Team
            <select class="select" id="teamSelect" onchange="NTFL.setAdminTeam(this.value)">
              ${teams.map(t => `<option value="${t.slug}" ${selectedTeam?.slug===t.slug ? "selected" : ""}>${esc(t.name)}</option>`).join("")}
            </select>
          </label>
          <div class="form-grid">
            <label>Head Coach<input class="input" name="headCoach" value="${esc(selectedTeam?.headCoach || "")}"></label>
            <label>Assistant Coach<input class="input" name="assistantCoach" value="${esc(selectedTeam?.assistantCoach || "")}"></label>
          </div>
          <label>Notes<textarea class="textarea" name="notes" rows="5">${esc(selectedTeam?.notes || "")}</textarea></label>
          <div class="row right">
            <button class="btn primary" onclick="NTFL.saveTeam()">Save Team</button>
          </div>
        </div>
      </div>

      <div class="admin-col">
        <div class="card" id="rankings-editor">
          ${adminSectionTitle("Rankings", "Drag and drop to reorder the public rankings list.")}
          <div class="rank-list" id="rankList">
            ${(state.data.rankings || []).map((r, idx) => `
              <div class="rank-item" draggable="true" data-rank-index="${idx}" ondragstart="NTFL.dragRankStart(event, ${idx})" ondragover="NTFL.dragRankOver(event)" ondrop="NTFL.dropRank(event, ${idx})">
                <div class="drag-handle">☰</div>
                <div class="rank-meta">
                  <strong>#${idx + 1} ${esc(r.team)}</strong>
                  <span>${esc(r.record || "")} • ${esc(r.division || "")}</span>
                </div>
                <div class="rank-actions">
                  <button class="mini-btn" onclick="NTFL.moveRank(${idx}, -1); return false;">↑</button>
                  <button class="mini-btn" onclick="NTFL.moveRank(${idx}, 1); return false;">↓</button>
                </div>
              </div>
            `).join("")}
          </div>
          <p class="muted tiny">Tip: drag a row or use the arrows. Reorder is saved in the draft immediately.</p>
        </div>

        <div class="card" id="awards-editor">
          ${adminSectionTitle("Awards", "Edit league awards and winners.")}
          <div class="grid stacked">
            ${(state.data.awards || []).map((a, idx) => `
              <div class="card nested" data-award-row="${idx}">
                <div class="form-grid compact">
                  <label>Category<input class="input" data-field="category" value="${esc(a.category || a.name || "")}"></label>
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
          ${adminSectionTitle("History", "Update season archive entries.")}
          <div class="grid stacked">
            ${(state.data.history || []).map((h, idx) => `
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
          ${adminSectionTitle("Hall of Fame", "Edit special honors and entries.")}
          <div class="grid stacked">
            ${(state.data.hallOfFame || []).map((h, idx) => `
              <div class="card nested" data-hof-row="${idx}">
                <div class="form-grid compact">
                  <label>Name<input class="input" data-field="name" value="${esc(h.name || "")}"></label>
                  <label>Team<input class="input" data-field="team" value="${esc(h.team || "")}"></label>
                  <label>Honor<input class="input" data-field="honor" value="${esc(h.honor || "")}"></label>
                  <label>Notes<input class="input" data-field="notes" value="${esc(h.notes || "")}"></label>
                </div>
              </div>
            `).join("") || `<div class="empty card">No Hall of Fame entries yet.</div>`}
          </div>
          <div class="row between">
            <button class="btn" onclick="NTFL.addHOF()">Add Hall of Fame Row</button>
            <button class="btn primary" onclick="NTFL.saveHOF()">Save Hall of Fame</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function footerHTML() {
  return `
    <footer class="footer container">
      <div>
        <strong>${esc(state.data.site.name)}</strong>
        <p>${esc(state.data.site.season)} • Version ${esc(state.data.site.version)} • Last updated ${esc(state.data.site.lastUpdated)}</p>
      </div>
      <div class="row tight">
        <a class="pill" href="#/admin">Admin</a>
        <a class="pill" href="#/history">History</a>
        <a class="pill" href="#/awards">Awards</a>
      </div>
    </footer>
  `;
}

function topbarHTML() {
  return `
    <header class="topbar">
      <div class="container topbar-inner">
        <a class="brand" href="#/home">
          <img src="${loadLogoSrc()}" alt="NTFL logo" onerror="this.src='assets/logo.svg'">
          <div class="brand-copy">
            <strong>${esc(state.data.site.name)}</strong>
            <span>${esc(state.data.site.season)}</span>
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
  document.title = `${state.data.site.name} • ${state.route.page[0].toUpperCase() + state.route.page.slice(1)}`;
  app.innerHTML = `
    <div class="shell">
      ${topbarHTML()}
      <main class="container main-content">
        ${body}
      </main>
      ${footerHTML()}
    </div>
  `;
}

function persistAndRender() {
  rebuildDerived(state.data);
  saveDraft(state.data);
  render();
}

function updateSiteFromInputs() {
  const card = document.getElementById("site-editor");
  if (!card) return;
  const inputs = card.querySelectorAll("input");
  const map = Object.fromEntries([...inputs].map(i => [i.name, i.value]));
  state.data.site.name = map.siteName || state.data.site.name;
  state.data.site.season = map.siteSeason || state.data.site.season;
  state.data.site.currentWeek = Number(map.siteWeek || state.data.site.currentWeek || 1);
  state.data.site.subtitle = map.siteSubtitle || state.data.site.subtitle;
  state.data.site.lastUpdated = new Date().toISOString().slice(0, 10);
}
function saveSite() {
  updateSiteFromInputs();
  persistAndRender();
}
function saveGames() {
  const card = document.getElementById("games-editor");
  if (!card) return;
  const rows = card.querySelectorAll(".game-edit");
  rows.forEach(row => {
    const id = row.dataset.gameId;
    const game = state.data.games.find(g => g.id === id);
    if (!game) return;
    const get = field => row.querySelector(`[data-field="${field}"]`)?.value ?? "";
    const hs = get("homeScore");
    const as = get("awayScore");
    game.homeScore = hs === "" ? null : Number(hs);
    game.awayScore = as === "" ? null : Number(as);
    game.status = get("status") || "upcoming";
    game.time = get("time");
    game.played = game.status === "final";
  });
  state.data.site.lastUpdated = new Date().toISOString().slice(0, 10);
  persistAndRender();
}
function saveTeam() {
  const card = document.getElementById("team-editor");
  if (!card) return;
  const slug = state.ui.adminTeam;
  const team = teamBySlug(slug);
  if (!team) return;
  team.headCoach = card.querySelector('[name="headCoach"]')?.value || "TBD";
  team.assistantCoach = card.querySelector('[name="assistantCoach"]')?.value || "TBD";
  team.notes = card.querySelector('[name="notes"]')?.value || "";
  state.data.site.lastUpdated = new Date().toISOString().slice(0, 10);
  persistAndRender();
}
function saveAwards() {
  const rows = document.querySelectorAll("#awards-editor [data-award-row]");
  state.data.awards = [...rows].map(row => ({
    category: row.querySelector('[data-field="category"]')?.value || "",
    winner: row.querySelector('[data-field="winner"]')?.value || "",
    team: row.querySelector('[data-field="team"]')?.value || ""
  }));
  state.data.site.lastUpdated = new Date().toISOString().slice(0, 10);
  persistAndRender();
}
function saveHistory() {
  const rows = document.querySelectorAll("#history-editor [data-history-row]");
  state.data.history = [...rows].map(row => ({
    season: row.querySelector('[data-field="season"]')?.value || "",
    champion: row.querySelector('[data-field="champion"]')?.value || "",
    record: row.querySelector('[data-field="record"]')?.value || "",
    notes: row.querySelector('[data-field="notes"]')?.value || ""
  }));
  state.data.site.lastUpdated = new Date().toISOString().slice(0, 10);
  persistAndRender();
}
function saveHOF() {
  const rows = document.querySelectorAll("#hof-editor [data-hof-row]");
  state.data.hallOfFame = [...rows].map(row => ({
    name: row.querySelector('[data-field="name"]')?.value || "",
    team: row.querySelector('[data-field="team"]')?.value || "",
    honor: row.querySelector('[data-field="honor"]')?.value || "",
    notes: row.querySelector('[data-field="notes"]')?.value || ""
  }));
  state.data.site.lastUpdated = new Date().toISOString().slice(0, 10);
  persistAndRender();
}
function addAward() {
  state.data.awards.push({ category: "", winner: "", team: "" });
  saveDraft(state.data);
  render();
}
function addHistory() {
  state.data.history.push({ season: "", champion: "", record: "", notes: "" });
  saveDraft(state.data);
  render();
}
function addHOF() {
  state.data.hallOfFame.push({ name: "", team: "", honor: "", notes: "" });
  saveDraft(state.data);
  render();
}
function setAdminDivision(value) {
  state.ui.adminDivision = value;
  state.ui.search = "";
  render();
}
function setAdminWeek(value) {
  state.ui.adminWeek = Number(value);
  render();
}
function setAdminTeam(value) {
  state.ui.adminTeam = value;
  render();
}
function searchTeams(value) {
  state.ui.search = value;
  render();
}
function login(event) {
  event.preventDefault();
  const form = event.target;
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
function saveBrowser() {
  saveDraft(state.data);
  alert("Draft saved in this browser.");
}
function download() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "data.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function dragRankStart(event, idx) {
  state.ui.adminRankDrag = idx;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(idx));
}
function dragRankOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}
function dropRank(event, idx) {
  event.preventDefault();
  const from = Number(event.dataTransfer.getData("text/plain") || state.ui.adminRankDrag);
  if (!Number.isFinite(from) || from === idx) return;
  moveRankInternal(from, idx);
}
function moveRank(idx, dir) {
  const to = idx + dir;
  if (to < 0 || to >= state.data.rankings.length) return;
  moveRankInternal(idx, to);
}
function moveRankInternal(from, to) {
  const list = [...state.data.rankings];
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  state.data.rankings = list;
  state.data.rankings = state.data.rankings.map((r, idx) => ({ ...r, rank: idx + 1 }));
  saveDraft(state.data);
  render();
}

window.NTFL = {
  searchTeams,
  setTeamTab,
  login,
  logout,
  saveBrowser,
  download,
  saveSite,
  saveGames,
  saveTeam,
  saveAwards,
  saveHistory,
  saveHOF,
  addAward,
  addHistory,
  addHOF,
  setAdminDivision,
  setAdminWeek,
  setAdminTeam,
  dragRankStart,
  dragRankOver,
  dropRank,
  moveRank
};

(async function init() {
  try {
    state.data = await loadData();
    if (!state.route.page) state.route = routeFromHash();
    if (!location.hash) location.hash = "#/home";
    render();
  } catch (err) {
    app.innerHTML = `<div class="container"><div class="card empty">Could not load NTFL data.</div></div>`;
    console.error(err);
  }
})();

window.addEventListener("hashchange", render);
window.addEventListener("storage", e => {
  if (e.key === STORAGE_KEY) {
    try {
      state.data = normalizeData(JSON.parse(e.newValue));
      render();
    } catch {}
  }
});
