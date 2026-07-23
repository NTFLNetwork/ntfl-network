
const STORAGE_KEY = "ntfl-site-data";
const AUTH_KEY = "ntfl-admin-auth";
const DATA_URL = "data/site-data.json";
const DEMO_USER = "demo";
const DEMO_PASS = "demo123";
const APP_VERSION = "paragon-modern-1";

const state = {
  data: null,
  route: { page: "home", slug: "" },
  search: "",
  adminDivision: "",
  adminWeek: 1,
  adminTeam: "",
};

function $(id) { return document.getElementById(id); }
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
}
function slugify(v) {
  return String(v ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function isAuthed() { return localStorage.getItem(AUTH_KEY) === "1"; }
function setAuthed(v) { if (v) localStorage.setItem(AUTH_KEY, "1"); else localStorage.removeItem(AUTH_KEY); }
function teamMap(data) { return data?.teams || {}; }
function teamsArray(data = state.data) { return Object.values(teamMap(data)); }
function divBySlug(slug) { return state.data.divisions.find(d => d.slug === slug); }
function teamBySlug(slug) { return state.data.teams[slug]; }
function currentWeek() { return Number(state.data?.site?.currentWeek || 1); }

function loadImageWithFallback(img) {
  img.onerror = () => {
    if (img.dataset.fallbackUsed !== "1") {
      img.dataset.fallbackUsed = "1";
      img.src = "assets/logo.svg";
    }
  };
}

async function loadData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try { return normalizeData(JSON.parse(stored)); } catch {}
  }
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load NTFL data");
  return normalizeData(await res.json());
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  state.data = normalizeData(data);
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function statusFromCell(cell) {
  if (cell.status) return cell.status;
  if (cell.played) return "final";
  if (cell.live) return "live";
  return "upcoming";
}

function buildRawForCell(teamName, cell) {
  if (cell.bye) return "BYE";
  const prefix = cell.home ? "vs" : "@";
  if (cell.status === "final" && Number.isFinite(cell.scoreFor) && Number.isFinite(cell.scoreAgainst)) {
    return `${prefix} ${cell.opponent} (${cell.scoreFor}-${cell.scoreAgainst})`;
  }
  if (cell.status === "live" && Number.isFinite(cell.scoreFor) && Number.isFinite(cell.scoreAgainst)) {
    return `${prefix} ${cell.opponent} (LIVE ${cell.scoreFor}-${cell.scoreAgainst})`;
  }
  return `${prefix} ${cell.opponent || "TBD"}`;
}

function computeScheduleMetrics(schedule) {
  const finals = schedule.filter(g => g.status === "final" && Number.isFinite(g.scoreFor) && Number.isFinite(g.scoreAgainst));
  const liveGames = schedule.filter(g => g.status === "live" && Number.isFinite(g.scoreFor) && Number.isFinite(g.scoreAgainst));
  let wins = 0, losses = 0, ties = 0, pf = 0, pa = 0;
  finals.forEach(g => {
    pf += g.scoreFor;
    pa += g.scoreAgainst;
    if (g.scoreFor > g.scoreAgainst) wins++;
    else if (g.scoreFor < g.scoreAgainst) losses++;
    else ties++;
  });
  // live games show on page but don't count toward record yet
  const gp = finals.length;
  const ppg = gp ? pf / gp : 0;
  const oppg = gp ? pa / gp : 0;
  const diff = pf - pa;
  const last5 = finals.slice(-5).reverse().map(g => ({ ...g }));
  let streak = "—";
  if (finals.length) {
    const end = finals[finals.length - 1];
    const target = end.scoreFor > end.scoreAgainst ? "W" : end.scoreFor < end.scoreAgainst ? "L" : "T";
    let count = 0;
    for (let i = finals.length - 1; i >= 0; i--) {
      const g = finals[i];
      const res = g.scoreFor > g.scoreAgainst ? "W" : g.scoreFor < g.scoreAgainst ? "L" : "T";
      if (res !== target) break;
      count++;
    }
    streak = `${target}${count}`;
  }
  return { wins, losses, ties, gamesPlayed: gp, pointsFor: pf, pointsAgainst: pa, pointDiff: diff, ppg, oppg, streak, last5, liveGames };
}

function normalizeData(raw) {
  const data = clone(raw || {});
  data.site = data.site || { name: "NTFL", season: "Season 3", currentWeek: 1, subtitle: "Editable league hub" };
  data.divisions = Array.isArray(data.divisions) ? data.divisions : [];
  data.awards = Array.isArray(data.awards) ? data.awards : [];
  data.history = Array.isArray(data.history) ? data.history : [];
  data.hallOfFame = Array.isArray(data.hallOfFame) ? data.hallOfFame : [];

  data.divisions.forEach((div, di) => {
    div.slug = div.slug || slugify(div.name || `division-${di + 1}`);
    div.teams = Array.isArray(div.teams) ? div.teams : [];
    div.weeks = Array.isArray(div.weeks) ? div.weeks : [];
    div.weeks.forEach((week, wi) => {
      week.week = week.week || `W${wi + 1}`;
      week.cells = Array.isArray(week.cells) ? week.cells : [];
      week.cells.forEach((cell, ci) => {
        cell.team = cell.team || "";
        cell.home = !!cell.home;
        cell.bye = !!cell.bye;
        cell.status = statusFromCell(cell);
        cell.played = cell.status === "final";
        if (cell.scoreFor === "" || cell.scoreFor === undefined) cell.scoreFor = null;
        if (cell.scoreAgainst === "" || cell.scoreAgainst === undefined) cell.scoreAgainst = null;
        cell.teamSlug = div.teams[ci] || slugify(cell.team);
        if (!cell.opponent && !cell.bye) cell.opponent = "TBD";
        if (cell.bye) {
          cell.raw = "BYE";
        } else if (!cell.raw || cell.raw === "BYE") {
          cell.raw = buildRawForCell(cell.team || cell.teamSlug, cell);
        }
      });
    });
  });

  const previousTeams = raw.teams || {};
  const teams = {};
  data.divisions.forEach((div) => {
    div.teams.forEach((slug) => {
      const prev = previousTeams[slug] || {};
      const schedule = [];
      div.weeks.forEach((week, wi) => {
        const cell = week.cells.find(c => c.teamSlug === slug) || null;
        if (!cell) return;
        const teamName = prev.name || cell.team || slug.replace(/-/g, " ").replace(/\b\w/g, s => s.toUpperCase());
        const recordCell = {
          week: wi + 1,
          weekLabel: week.week,
          opponent: cell.opponent || "TBD",
          home: !!cell.home,
          bye: !!cell.bye,
          status: cell.status,
          played: cell.status === "final",
          scoreFor: Number.isFinite(Number(cell.scoreFor)) ? Number(cell.scoreFor) : null,
          scoreAgainst: Number.isFinite(Number(cell.scoreAgainst)) ? Number(cell.scoreAgainst) : null,
          raw: buildRawForCell(teamName, cell),
          result: null,
        };
        if (recordCell.played && Number.isFinite(recordCell.scoreFor) && Number.isFinite(recordCell.scoreAgainst)) {
          recordCell.result = recordCell.scoreFor > recordCell.scoreAgainst ? "W" : recordCell.scoreFor < recordCell.scoreAgainst ? "L" : "T";
        }
        schedule.push(recordCell);
      });
      const metrics = computeScheduleMetrics(schedule);
      teams[slug] = {
        name: prev.name || div.teamsName?.[slug] || (prev.name || slug.replace(/-/g, " ").replace(/\b\w/g, s => s.toUpperCase())),
        slug,
        division: div.slug,
        divisionName: div.name,
        headCoach: prev.headCoach || "",
        assistantCoach: prev.assistantCoach || "",
        notes: prev.notes || "",
        logo: prev.logo || "",
        schedule,
        ...metrics,
      };
    });
  });

  data.teams = teams;
  data.rankings = Array.isArray(raw.rankings) && raw.rankings.length ? raw.rankings.map(r => {
    const slug = r.slug || slugify(r.team);
    const t = teams[slug];
    return t ? {
      rank: r.rank || 0,
      slug,
      team: t.name,
      record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`,
      pointsFor: t.pointsFor,
      pointsAgainst: t.pointsAgainst,
      pointDiff: t.pointDiff,
    } : r;
  }).sort((a,b) => (a.rank || 999) - (b.rank || 999)) : standingsDataFromTeams(teams);

  return data;
}

function standingsDataFromTeams(teamsObj = state.data.teams) {
  const arr = Object.values(teamsObj).map(t => {
    const gp = t.gamesPlayed || 0;
    const pct = gp ? ((t.wins + 0.5 * t.ties) / gp) : 0;
    return { ...t, pct };
  });
  arr.sort((a,b) => (b.pct - a.pct) || (b.pointDiff - a.pointDiff) || (b.pointsFor - a.pointsFor) || a.name.localeCompare(b.name));
  return arr.map((t, i) => ({
    rank: i + 1,
    slug: t.slug,
    team: t.name,
    division: t.divisionName,
    record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`,
    wins: t.wins,
    losses: t.losses,
    ties: t.ties,
    pointsFor: t.pointsFor,
    pointsAgainst: t.pointsAgainst,
    pointDiff: t.pointDiff,
  }));
}

function formatBadge(status, scoreFor, scoreAgainst) {
  if (status === "live") return `<span class="badge tbd">LIVE</span>`;
  if (status === "final" && Number.isFinite(scoreFor) && Number.isFinite(scoreAgainst)) {
    if (scoreFor > scoreAgainst) return `<span class="badge win">W</span>`;
    if (scoreFor < scoreAgainst) return `<span class="badge loss">L</span>`;
    return `<span class="badge tbd">T</span>`;
  }
  return `<span class="badge tbd">—</span>`;
}

function formatRecord(t) {
  return `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`;
}

function hero(kicker, title, subtitle) {
  return `
    <section class="hero">
      <div class="hero-card hero-grid">
        <div class="hero-mark" aria-hidden="true">
          <img src="assets/IMG_5900.png" alt="">
        </div>
        <div class="hero-copy">
          <span class="kicker">${esc(kicker)}</span>
          <h1 class="title">${esc(title)}</h1>
          <div class="subtitle">${subtitle}</div>
        </div>
      </div>
    </section>
  `;
}

function navHtml() {
  return `
    <div class="dropdown" id="menuDropdown">
      <button type="button" id="menuButton">League Menu ▾</button>
      <div class="dropdown-panel">
        <div class="menu-section">
          <div class="menu-heading">League</div>
          <div class="menu-subtitle">Main pages and live league pages.</div>
          <a class="menu-link" href="#/"><strong>Home</strong><small>Latest updates and featured games</small></a>
          <a class="menu-link" href="#/teams"><strong>Teams</strong><small>Click any team for a rundown</small></a>
          <a class="menu-link" href="#/schedule"><strong>Schedule</strong><small>All weeks and results</small></a>
          <a class="menu-link" href="#/standings"><strong>Standings</strong><small>Records and point differential</small></a>
        </div>
        <div class="menu-section">
          <div class="menu-heading">Extras</div>
          <div class="menu-subtitle">Season pages and league history.</div>
          <a class="menu-link" href="#/rankings"><strong>Rankings</strong><small>Drag-reorder power rankings</small></a>
          <a class="menu-link" href="#/awards"><strong>Awards</strong><small>MVP, coach, and more</small></a>
          <a class="menu-link" href="#/history"><strong>History</strong><small>Past seasons and champions</small></a>
          <a class="menu-link" href="#/hof"><strong>Hall of Fame</strong><small>Legends and memories</small></a>
        </div>
        <div class="menu-section">
          <div class="menu-heading">Admin</div>
          <a class="menu-link" href="#/admin"><strong>Admin</strong><small>Edit teams, scores, rankings, and pages</small></a>
        </div>
      </div>
    </div>
    <button type="button" id="authBtn">${isAuthed() ? "Logout" : "Admin Login"}</button>
  `;
}

function shellHtml() {
  return `
    <div class="shell">
      <div class="topbar">
        <div class="container topbar-inner">
          <a class="brand" href="#/">
            <img id="brandLogo" src="assets/IMG_5900.png" alt="NTFL logo">
            <div class="meta">
              <div>${esc(state.data.site.name)} <span class="muted">${esc(state.data.site.season)}</span></div>
              <span>${esc(state.data.site.subtitle || "Editable league hub")}</span>
            </div>
          </a>
          <nav class="nav">${navHtml()}</nav>
        </div>
      </div>
      <main class="container" id="view"></main>
      <div class="container footer">
        <div class="divider"></div>
        <div class="row" style="justify-content:space-between;align-items:center">
          <div>NTFL schedule note: numbers in parentheses are scores. Example: <strong>vs Chargers (62-112)</strong> means the team scored 62 and lost 112-62.</div>
          <div class="pill">Build ${APP_VERSION}</div>
        </div>
      </div>
    </div>
  `;
}

function homeView() {
  const standings = standingsDataFromTeams();
  const liveOrFinal = [];
  state.data.divisions.forEach(div => {
    div.weeks.forEach(week => {
      week.cells.forEach(c => {
        if (c.status === "final" || c.status === "live") {
          liveOrFinal.push({ week: week.week, team: c.team || c.teamSlug, raw: c.raw, status: c.status, scoreFor: c.scoreFor, scoreAgainst: c.scoreAgainst, opponent: c.opponent });
        }
      });
    });
  });
  liveOrFinal.reverse();
  const top = standings.slice(0, 4);
  return `
    ${hero(`Week ${currentWeek()}`, `${state.data.site.name} Week ${currentWeek()}`, "A mobile-friendly league hub with team pages, PPG, awards, history, and editable admin controls. Click any team name anywhere to open its rundown.")}
    <section class="section">
      <div class="grid cols-4">
        <div class="card stat"><div class="muted small">Teams</div><strong>${Object.keys(state.data.teams).length}</strong><div class="muted small">All teams are clickable</div></div>
        <div class="card stat"><div class="muted small">Divisions</div><strong>${state.data.divisions.length}</strong><div class="muted small">League groups</div></div>
        <div class="card stat"><div class="muted small">Current Week</div><strong>${currentWeek()}</strong><div class="muted small">Schedule focus</div></div>
        <div class="card stat"><div class="muted small">Completed / Live</div><strong>${liveOrFinal.length}</strong><div class="muted small">Tracked on the site</div></div>
      </div>
    </section>
    <section class="section">
      <div class="grid cols-2">
        <div class="card">
          <h2>Top of the table</h2>
          <table>
            <thead><tr><th>Rank</th><th>Team</th><th>Record</th><th>Diff</th></tr></thead>
            <tbody>
              ${top.map(t => `<tr><td>${t.rank}</td><td><a href="#/team/${t.slug}">${esc(t.team)}</a></td><td>${esc(t.record)}</td><td>${t.pointDiff >= 0 ? "+" : ""}${t.pointDiff}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div class="card">
          <h2>Recent games</h2>
          ${liveOrFinal.slice(0,4).map(g => `
            <div class="row" style="justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)">
              <div>
                <div><strong>${esc(g.team)}</strong> ${esc(g.raw)}</div>
                <div class="muted small">${esc(g.week)} • ${g.status.toUpperCase()}${g.opponent ? ` • vs ${esc(g.opponent)}` : ""}</div>
              </div>
              <div>${formatBadge(g.status, g.scoreFor, g.scoreAgainst)} ${g.status !== "upcoming" && g.scoreFor != null ? `<strong>${g.scoreFor}-${g.scoreAgainst}</strong>` : ""}</div>
            </div>
          `).join("") || `<div class="notice">No completed or live games yet.</div>`}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="card">
        <h2>Teams by division</h2>
        <div class="grid cols-2">
          ${state.data.divisions.map(div => `
            <div class="card" style="background:rgba(255,255,255,.02)">
              <h3>${esc(div.name)}</h3>
              <div class="row">${div.teams.map(s => `<a class="pill" href="#/team/${s}">${esc(teamBySlug(s)?.name || s)}</a>`).join("")}</div>
            </div>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function teamsView() {
  const q = state.search.toLowerCase();
  const groups = state.data.divisions.map(div => ({
    name: div.name,
    slug: div.slug,
    teams: div.teams.map(slug => teamBySlug(slug)).filter(t => !q || t.name.toLowerCase().includes(q) || (t.headCoach || "").toLowerCase().includes(q) || (t.assistantCoach || "").toLowerCase().includes(q))
  })).filter(g => g.teams.length);
  return `
    ${hero("Teams", "Click any team for a full rundown", "Each team page includes overview, schedule, PPG, coaching staff, and notes. Search by team name or coach.")}
    <section class="section"><div class="card"><input class="search" id="teamSearch" placeholder="Search team or coach..." value="${esc(state.search)}"></div></section>
    ${groups.map(group => `
      <section class="section">
        <div class="card">
          <div class="row" style="justify-content:space-between"><h2>${esc(group.name)}</h2><a class="pill" href="#/schedule/${group.slug}">View schedule</a></div>
          <div class="team-list">
            ${group.teams.map(t => `
              <a class="team-card" href="#/team/${t.slug}">
                <div class="division">${esc(t.divisionName)}</div>
                <div class="name">${esc(t.name)}</div>
                <div class="muted small">${esc(formatRecord(t))} • PPG ${t.ppg.toFixed(1)}</div>
                <div class="muted small">Head coach: ${esc(t.headCoach || "TBD")}</div>
              </a>
            `).join("")}
          </div>
        </div>
      </section>
    `).join("") || `<section class="section"><div class="card notice">No teams matched that search.</div></section>`}
  `;
}

function scheduleView(slug) {
  const div = slug ? divBySlug(slug) : state.data.divisions[0];
  if (!div) return `<section class="section"><div class="card">Schedule not found.</div></section>`;
  return `
    ${hero(div.name, `${div.name} schedule`, "Scores and statuses update from the admin editor. LIVE games show immediately, FINAL games count toward records and PPG.")}
    <section class="section"><div class="card"><div class="row">${state.data.divisions.map(d => `<a class="chip-btn" href="#/schedule/${d.slug}">${esc(d.name)}</a>`).join("")}</div></div></section>
    <section class="section">
      <div class="card">
        <table>
          <thead><tr><th>Week</th>${div.teams.map(s => `<th><a href="#/team/${s}">${esc(teamBySlug(s)?.name || s)}</a></th>`).join("")}</tr></thead>
          <tbody>
            ${div.weeks.map((week, wi) => `
              <tr class="${week.week === `W${currentWeek()}` ? "current" : ""}">
                <td>${esc(week.week)}</td>
                ${week.cells.map((c, ci) => {
                  const teamSlug = div.teams[ci] || c.teamSlug;
                  const teamName = teamBySlug(teamSlug)?.name || c.team || teamSlug;
                  const status = c.status || (c.played ? "final" : "upcoming");
                  const val = c.bye ? "BYE" : c.raw || buildRawForCell(teamName, c);
                  return `<td>
                    <div class="row" style="justify-content:space-between;align-items:center">
                      <a href="#/team/${teamSlug}"><strong>${esc(val)}</strong></a>
                      ${c.bye ? `<span class="muted small">BYE</span>` : formatBadge(status, c.scoreFor, c.scoreAgainst)}
                    </div>
                    <div class="muted small">${status.toUpperCase()}${c.opponent ? ` • ${esc(c.opponent)}` : ""}</div>
                  </td>`;
                }).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function standingsRows() {
  return standingsDataFromTeams().map(r => r);
}

function standingsView() {
  const rows = standingsRows();
  return `
    ${hero("Standings", "League standings", "Auto-calculated from final game scores. Teams are clickable from the table.")}
    <section class="section"><div class="card"><table><thead><tr><th>#</th><th>Team</th><th>Div</th><th>Record</th><th>PF</th><th>PA</th><th>Diff</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.rank}</td><td><a href="#/team/${r.slug}">${esc(r.team)}</a></td><td>${esc(r.division)}</td><td>${esc(r.record)}</td><td>${r.pointsFor}</td><td>${r.pointsAgainst}</td><td>${r.pointDiff >= 0 ? "+" : ""}${r.pointDiff}</td></tr>`).join("")}</tbody></table></div></section>
  `;
}

function rankingsView() {
  const rows = Array.isArray(state.data.rankings) && state.data.rankings.length ? state.data.rankings : standingsRows();
  return `
    ${hero("Rankings", "Power rankings", "Editable in Admin, and also tied to the current schedule data." )}
    <section class="section"><div class="card"><table><thead><tr><th>#</th><th>Team</th><th>Record</th><th>PF</th><th>PA</th><th>Diff</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.rank || ""}</td><td><a href="#/team/${r.slug || slugify(r.team)}">${esc(r.team)}</a></td><td>${esc(r.record || "")}</td><td>${r.pointsFor ?? ""}</td><td>${r.pointsAgainst ?? ""}</td><td>${(r.pointDiff ?? 0) >= 0 ? "+" : ""}${r.pointDiff ?? 0}</td></tr>`).join("")}</tbody></table></div></section>
  `;
}

function awardsView() {
  return `
    ${hero("Awards", "League awards", "Edit these in Admin. The page is ready for MVP, Offensive Player, Defensive Player, Rookie, and Coach of the Year.")}
    <section class="section"><div class="grid cols-2">${state.data.awards.map(a => `<div class="card"><h3>${esc(a.category || a.name || "Award")}</h3><div class="pill">${esc(a.winner || "TBD")} • ${esc(a.team || "TBD")}</div></div>`).join("")}</div></section>
  `;
}

function historyView() {
  return `
    ${hero("History", "League history", "A timeline for champions, records, and notes.")}
    <section class="section"><div class="grid cols-2">${state.data.history.map(h => `<div class="card"><h3>${esc(h.season)}</h3><div class="row"><span class="pill">Champion: ${esc(h.champion || "TBD")}</span><span class="pill">Record: ${esc(h.record || "TBD")}</span></div><div style="height:10px"></div><div class="muted">${esc(h.notes || "")}</div></div>`).join("")}</div></section>
  `;
}

function hofView() {
  return `
    ${hero("Hall of Fame", "Hall of Fame", "Ready for legends, jerseys, and memorable moments.")}
    <section class="section"><div class="card notice">You can fill this page later from the admin editor, or leave it as a future NTFL section.</div></section>
  `;
}

function teamView(slug) {
  const team = teamBySlug(slug);
  if (!team) return `<section class="section"><div class="card">Team not found.</div></section>`;
  const tabs = ["overview", "schedule", "ppg", "coaches", "notes"];
  return `
    ${hero(team.divisionName, team.name, `${team.divisionName} • click through tabs for a full rundown.`)}
    <section class="section">
      <div class="card">
        <div class="row">
          <span class="pill">Record: ${esc(formatRecord(team))}</span>
          <span class="pill">PF ${team.pointsFor}</span>
          <span class="pill">PA ${team.pointsAgainst}</span>
          <span class="pill">PPG ${team.ppg.toFixed(1)}</span>
          <span class="pill">OPPG ${team.oppg.toFixed(1)}</span>
          <span class="pill">Diff ${team.pointDiff >= 0 ? "+" : ""}${team.pointDiff}</span>
        </div>
        <div class="tabs" id="teamTabs">${tabs.map((t, i) => `<button class="tab ${i===0 ? "active" : ""}" data-tab="${t}">${t.toUpperCase()}</button>`).join("")}</div>
        <div class="panel active" data-panel="overview">
          <div class="grid cols-2">
            <div class="card">
              <h3>Season rundown</h3>
              <div class="muted">Current record, scoring profile, and last five final games.</div>
              <div class="divider"></div>
              <div class="row"><span class="pill">Games played: ${team.gamesPlayed}</span><span class="pill">Streak: ${esc(team.streak || "—")}</span></div>
              <div style="height:12px"></div>
              ${team.last5.length ? team.last5.map(g => `<div class="row" style="justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)"><div><strong>${esc(g.weekLabel)} — ${esc(g.opponent || "TBD")}</strong><div class="muted small">${g.scoreFor != null ? `${g.scoreFor}-${g.scoreAgainst}` : "No score yet"}</div></div><div>${formatBadge(g.status, g.scoreFor, g.scoreAgainst)}</div></div>`).join("") : `<div class="notice">No completed games yet.</div>`}
            </div>
            <div class="card"><h3>Quick notes</h3><div class="notice">${esc(team.notes || "Add notes in the admin dashboard.")}</div></div>
          </div>
        </div>
        <div class="panel" data-panel="schedule">
          <div class="card">
            ${team.schedule.map(g => `<div class="row" style="justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)"><div><strong>${esc(g.weekLabel)} — ${esc(g.raw)}</strong><div class="muted small">${esc(g.opponent || "TBD")}</div></div><div>${formatBadge(g.status, g.scoreFor, g.scoreAgainst)} ${g.scoreFor != null ? `<strong>${g.scoreFor}-${g.scoreAgainst}</strong>` : ""}</div></div>`).join("")}
          </div>
        </div>
        <div class="panel" data-panel="ppg">
          <div class="grid cols-3">
            <div class="card stat"><div class="muted small">Points per game</div><strong>${team.ppg.toFixed(1)}</strong></div>
            <div class="card stat"><div class="muted small">Points allowed per game</div><strong>${team.oppg.toFixed(1)}</strong></div>
            <div class="card stat"><div class="muted small">Point differential</div><strong>${team.pointDiff >= 0 ? "+" : ""}${team.pointDiff}</strong></div>
          </div>
        </div>
        <div class="panel" data-panel="coaches">
          <div class="grid cols-2">
            <div class="card"><h3>Head coach</h3><div class="pill">${esc(team.headCoach || "TBD")}</div></div>
            <div class="card"><h3>Assistant coach</h3><div class="pill">${esc(team.assistantCoach || "TBD")}</div></div>
          </div>
        </div>
        <div class="panel" data-panel="notes"><div class="card"><div class="notice">${esc(team.notes || "Add notes in the admin dashboard.")}</div></div></div>
      </div>
    </section>
  `;
}

function rankingMetaForSlug(slug) {
  const team = state.data.teams?.[slug];
  if (!team) return null;
  return {
    slug,
    team: team.name,
    record: `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""}`,
    pointsFor: team.pointsFor,
    pointsAgainst: team.pointsAgainst,
    pointDiff: team.pointDiff,
  };
}

function rankingRowsFromState() {
  const source = Array.isArray(state.data.rankings) && state.data.rankings.length
    ? state.data.rankings
    : standingsDataFromTeams().slice(0, Math.max(8, Object.keys(state.data.teams || {}).length));
  return source.map((row, idx) => {
    const slug = row.slug || slugify(row.team);
    const meta = rankingMetaForSlug(slug) || null;
    return {
      rank: idx + 1,
      slug,
      team: meta?.team || row.team || "",
      note: row.note || row.blurb || "",
      record: meta?.record || row.record || "",
      pointsFor: meta?.pointsFor ?? row.pointsFor ?? "",
      pointsAgainst: meta?.pointsAgainst ?? row.pointsAgainst ?? "",
      pointDiff: meta?.pointDiff ?? row.pointDiff ?? "",
    };
  });
}

function rankingEditorRowHtml(row, idx) {
  const teams = Object.values(state.data.teams || {});
  return `
    <div class="ranking-item" draggable="true" data-ranking-row data-index="${idx}">
      <div class="rank-handle" title="Drag to reorder">☰</div>
      <div class="rank-number">${idx + 1}</div>
      <div class="rank-fields">
        <div>
          <label class="small muted">Team</label>
          <select class="rankingTeamInput">
            ${teams.map(t => `<option value="${esc(t.slug)}" ${t.slug === row.slug ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="small muted">Note</label>
          <input class="rankingNoteInput" value="${esc(row.note || '')}" placeholder="Optional note">
        </div>
      </div>
      <div class="rank-actions">
        <button type="button" class="chip-btn secondary rank-up">Up</button>
        <button type="button" class="chip-btn secondary rank-down">Down</button>
        <button type="button" class="chip-btn secondary rank-remove">Remove</button>
      </div>
    </div>
  `;
}

function rankingsEditorHtml() {
  const rows = rankingRowsFromState();
  return `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-end">
        <div>
          <h3>Rankings</h3>
          <div class="muted small">Drag to reorder, then save. Rankings are automatically renumbered.</div>
        </div>
        <div class="actions">
          <button type="button" class="chip-btn secondary" id="addRankingBtn">Add row</button>
          <button type="button" class="chip-btn secondary" id="resetRankingsBtn">Reset from standings</button>
        </div>
      </div>
      <div style="height:12px"></div>
      <div id="rankingsEditor" class="rankings-editor">
        ${rows.map((row, idx) => rankingEditorRowHtml(row, idx)).join('')}
      </div>
    </div>
  `;
}

function collectRankingsFromEditor() {
  const rows = Array.from(document.querySelectorAll('#rankingsEditor [data-ranking-row]'));
  return rows.map((row, idx) => {
    const slug = row.querySelector('.rankingTeamInput')?.value || '';
    const note = row.querySelector('.rankingNoteInput')?.value || '';
    const team = state.data.teams?.[slug];
    if (!team) return null;
    return {
      rank: idx + 1,
      slug,
      team: team.name,
      note,
      record: `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ''}`,
      pointsFor: team.pointsFor,
      pointsAgainst: team.pointsAgainst,
      pointDiff: team.pointDiff,
    };
  }).filter(Boolean);
}

function renumberRankingEditor() {
  document.querySelectorAll('#rankingsEditor [data-ranking-row]').forEach((row, idx) => {
    const num = row.querySelector('.rank-number');
    if (num) num.textContent = idx + 1;
    row.dataset.index = idx;
  });
}

function moveRankingRow(row, direction) {
  const editor = $('rankingsEditor');
  if (!editor || !row) return;
  const rows = Array.from(editor.querySelectorAll('[data-ranking-row]'));
  const idx = rows.indexOf(row);
  const nextIdx = idx + direction;
  if (idx < 0 || nextIdx < 0 || nextIdx >= rows.length) return;
  if (direction < 0) {
    editor.insertBefore(row, rows[nextIdx]);
  } else {
    editor.insertBefore(rows[nextIdx], row);
  }
  renumberRankingEditor();
}

function adminLoginView() {
  return `
    ${hero("Admin", "Demo login", "Use the demo login to open the dashboard and edit the league data.")}
    <section class="section">
      <div class="card" style="max-width:520px;margin:0 auto">
        <div class="grid cols-2">
          <div><label class="small muted">Username</label><input id="loginUser" placeholder="Username"></div>
          <div><label class="small muted">Password</label><input id="loginPass" type="password" placeholder="Password"></div>
        </div>
        <div style="height:12px"></div>
        <div class="actions"><button class="chip-btn primary" id="loginBtn">Log in</button></div>
        <div class="muted small" id="adminStatus" style="margin-top:10px">Enter your admin credentials to access the dashboard.</div>
      </div>
    </section>
  `;
}

function adminFormView() {
  if (!state.adminDivision) state.adminDivision = state.data.divisions[0]?.slug || "";
  if (!state.adminTeam) state.adminTeam = Object.keys(state.data.teams)[0] || "";
  if (!state.adminWeek) state.adminWeek = currentWeek();
  const div = divBySlug(state.adminDivision) || state.data.divisions[0];
  const team = teamBySlug(state.adminTeam) || teamBySlug(Object.keys(state.data.teams)[0]);
  const weekIdx = Math.max(0, (Number(state.adminWeek) || 1) - 1);
  const week = div?.weeks?.[weekIdx] || div?.weeks?.[0];
  return `
    ${hero("Admin", "Editable dashboard", "Change site info, game scores, live/final status, team notes, awards, history, and rankings from one place.")}
    <section class="section">
      <div class="grid cols-2">
        <div class="card">
          <h3>Quick controls</h3>
          <div class="grid cols-2">
            <div><label class="small muted">Site name</label><input id="siteNameInput" value="${esc(state.data.site.name)}"></div>
            <div><label class="small muted">Season</label><input id="seasonInput" value="${esc(state.data.site.season || "")}"></div>
            <div><label class="small muted">Subtitle</label><input id="subtitleInput" value="${esc(state.data.site.subtitle || "")}"></div>
            <div><label class="small muted">Current week</label><input id="currentWeekInput" type="number" min="1" max="18" value="${esc(state.data.site.currentWeek)}"></div>
          </div>
          <div class="divider"></div>
          <div class="actions">
            <button class="chip-btn primary" id="saveAllBtn">Save to browser</button>
            <button class="chip-btn secondary" id="exportJsonBtn">Export JSON</button>
            <label class="chip-btn secondary" for="importJsonFile" style="cursor:pointer">Import JSON</label>
            <input id="importJsonFile" type="file" accept=".json" class="hidden">
            <button class="chip-btn secondary" id="resetJsonBtn">Reset from file</button>
          </div>
          <div class="notice" style="margin-top:12px">Make edits here, save to the browser, and export JSON when you want to upload the update for everyone else.</div>
          <div class="row" style="margin-top:10px">
            <button class="chip-btn secondary" id="logoutBtn">Log out</button>
          </div>
        </div>
        <div class="card">
          <h3>Game editor</h3>
          <div class="grid cols-2">
            <div><label class="small muted">Division</label><select id="adminDivisionSelect">${state.data.divisions.map(d => `<option value="${esc(d.slug)}" ${d.slug===div?.slug ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></div>
            <div><label class="small muted">Week</label><select id="adminWeekSelect">${(div?.weeks || []).map((w, i) => `<option value="${i+1}" ${i+1===Number(state.adminWeek) ? "selected" : ""}>${esc(w.week)}</option>`).join("")}</select></div>
          </div>
          <div style="height:12px"></div>
          <div class="notice">Change score or status here. FINAL games count toward records and PPG. LIVE games show on the site without locking the score in yet.</div>
        </div>
      </div>
    </section>
    <section class="section"><div class="card"><table><thead><tr><th>Team</th><th>Opponent</th><th>Status</th><th>Score For</th><th>Score Against</th></tr></thead><tbody>${(week?.cells || []).map((c, idx) => {
      const slug = div?.teams[idx] || c.teamSlug || slugify(c.team);
      const teamName = teamBySlug(slug)?.name || c.team || slug;
      if (c.bye) return `<tr><td>${esc(teamName)}</td><td colspan="4">BYE</td></tr>`;
      return `<tr>
        <td>${esc(teamName)}</td>
        <td>${esc(c.opponent || "TBD")}</td>
        <td><select class="gameStatus" data-idx="${idx}"><option value="upcoming" ${c.status==="upcoming"?"selected":""}>upcoming</option><option value="live" ${c.status==="live"?"selected":""}>live</option><option value="final" ${c.status==="final"?"selected":""}>final</option></select></td>
        <td><input class="gameFor" data-idx="${idx}" type="number" value="${c.scoreFor ?? ""}" placeholder="0"></td>
        <td><input class="gameAgainst" data-idx="${idx}" type="number" value="${c.scoreAgainst ?? ""}" placeholder="0"></td>
      </tr>`;
    }).join("")}</tbody></table></div></section>
    <section class="section">
      <div class="grid cols-2">
        <div class="card">
          <h3>Team editor</h3>
          <div class="grid cols-2">
            <div><label class="small muted">Team</label><select id="adminTeamSelect">${Object.values(state.data.teams).map(t => `<option value="${esc(t.slug)}" ${t.slug===team?.slug ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>
            <div><label class="small muted">Logo file path</label><input id="teamLogoInput" value="${esc(team?.logo || "")}" placeholder="assets/IMG_5900.png"></div>
            <div><label class="small muted">Head coach</label><input id="headCoachInput" value="${esc(team?.headCoach || "")}"></div>
            <div><label class="small muted">Assistant coach</label><input id="assistantCoachInput" value="${esc(team?.assistantCoach || "")}"></div>
          </div>
          <div style="height:12px"></div>
          <label class="small muted">Notes</label>
          <textarea id="notesInput" style="min-height:180px">${esc(team?.notes || "")}</textarea>
        </div>
        <div class="card">
          <h3>Rankings / Awards / History / HOF JSON</h3>
          <div class="grid cols-2">
            <div><label class="small muted">Awards</label><textarea id="awardsInput" style="min-height:110px">${esc(JSON.stringify(state.data.awards, null, 2))}</textarea></div>
            <div><label class="small muted">History</label><textarea id="historyInput" style="min-height:110px">${esc(JSON.stringify(state.data.history, null, 2))}</textarea></div>
            <div><label class="small muted">Hall of Fame</label><textarea id="hofInput" style="min-height:110px">${esc(JSON.stringify(state.data.hallOfFame, null, 2))}</textarea></div>
          </div>
        </div>
      </div>
    </section>
    <section class="section">
      ${rankingsEditorHtml()}
    </section>
    <section class="section">
      <div class="card">
        <h3>Raw JSON editor</h3>
        <textarea id="jsonEditor" style="min-height:360px">${esc(JSON.stringify(state.data, null, 2))}</textarea>
        <div class="muted small" id="adminStatus" style="margin-top:10px">Enter your admin credentials to access the dashboard.</div>
      </div>
    </section>
  `;
}

function renderView() {
  const view = $("view");
  const page = state.route.page || "home";
  const slug = state.route.slug || "";
  if (!view) return;
  if (page === "home") view.innerHTML = homeView();
  else if (page === "teams") view.innerHTML = teamsView();
  else if (page === "schedule") view.innerHTML = scheduleView(slug);
  else if (page === "standings") view.innerHTML = standingsView();
  else if (page === "rankings") view.innerHTML = rankingsView();
  else if (page === "awards") view.innerHTML = awardsView();
  else if (page === "history") view.innerHTML = historyView();
  else if (page === "hof") view.innerHTML = hofView();
  else if (page === "team") view.innerHTML = teamView(slug);
  else if (page === "admin") view.innerHTML = isAuthed() ? adminFormView() : adminLoginView();
  else view.innerHTML = homeView();
  bindViewEvents();
}

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  state.route = { page: parts[0] || "home", slug: parts[1] || "" };
}

function setActiveTab(tab) {
  document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach(panel => panel.classList.toggle("active", panel.dataset.panel === tab));
}

function bindViewEvents() {
  const search = $("teamSearch");
  if (search) {
    search.addEventListener("input", () => { state.search = search.value; renderView(); });
  }

  const tabs = $("teamTabs");
  if (tabs) {
    tabs.addEventListener("click", e => {
      const btn = e.target.closest(".tab");
      if (!btn) return;
      setActiveTab(btn.dataset.tab);
    });
  }

  const menuButton = $("menuButton");
  const menuDropdown = $("menuDropdown");
  if (menuButton && menuDropdown) {
    menuButton.onclick = (e) => { e.stopPropagation(); menuDropdown.classList.toggle("open"); };
    document.body.onclick = () => menuDropdown.classList.remove("open");
  }

  const authBtn = $("authBtn");
  if (authBtn) {
    authBtn.onclick = () => {
      if (isAuthed()) {
        setAuthed(false);
        if (location.hash === "#/admin") location.hash = "#/";
        render();
      } else {
        location.hash = "#/admin";
      }
    };
  }

  if (state.route.page === "admin") bindAdminEvents();
}

function buildGamePairUpdates(data, divSlug, weekNumber) {
  const div = data.divisions.find(d => d.slug === divSlug);
  if (!div) return data;
  const week = div.weeks[weekNumber - 1];
  if (!week) return data;

  week.cells.forEach((cell, idx) => {
    if (cell.bye) return;
    const slug = div.teams[idx] || cell.teamSlug || slugify(cell.team);
    const team = data.teams[slug];
    const mirrorName = cell.opponent || "";
    // rebuild cell display from current source and status
    cell.status = statusFromCell(cell);
    cell.played = cell.status === "final";
    cell.raw = buildRawForCell(team?.name || cell.team || slug, cell);
  });

  // try to sync mirrored cells by matching opponent/team names within the same week
  const allCells = [];
  data.divisions.forEach(d => d.weeks.forEach((w, wi) => w.cells.forEach((c, ci) => {
    allCells.push({ d, w, wi, c, ci });
  })));
  week.cells.forEach((cell, idx) => {
    if (cell.bye) return;
    const slug = div.teams[idx] || cell.teamSlug || slugify(cell.team);
    const teamName = data.teams[slug]?.name || cell.team || slug;
    const oppSlug = slugify(cell.opponent || "");
    const match = allCells.find(x => !(x.d.slug === divSlug && x.w.week === week.week && x.c === cell) && x.w.week === week.week && !x.c.bye && (slugify(x.c.team) === oppSlug || slugify(x.c.team) === slugify(cell.opponent)) && slugify(x.c.opponent || "") === slugify(teamName));
    if (match) {
      match.c.status = cell.status;
      match.c.played = cell.status === "final";
      match.c.scoreFor = cell.scoreAgainst;
      match.c.scoreAgainst = cell.scoreFor;
      match.c.raw = buildRawForCell(match.c.team, match.c);
    }
  });

  return data;
}

function bindAdminEvents() {
  const status = $("adminStatus");
  const loginBtn = $("loginBtn");
  const loginUser = $("loginUser");
  const loginPass = $("loginPass");
  if (loginBtn) {
    loginBtn.onclick = () => {
      if ((loginUser?.value || "").trim() === DEMO_USER && (loginPass?.value || "").trim() === DEMO_PASS) {
        setAuthed(true);
        renderView();
      } else if (status) {
        status.textContent = "Wrong demo login. Try demo / demo123.";
      }
    };
    return;
  }

  const divSelect = $("adminDivisionSelect");
  const weekSelect = $("adminWeekSelect");
  const teamSelect = $("adminTeamSelect");
  if (divSelect) divSelect.onchange = () => { state.adminDivision = divSelect.value; state.adminWeek = 1; renderView(); };
  if (weekSelect) weekSelect.onchange = () => { state.adminWeek = Number(weekSelect.value || 1); renderView(); };
  if (teamSelect) teamSelect.onchange = () => { state.adminTeam = teamSelect.value; renderView(); };

  $("logoutBtn")?.addEventListener("click", () => { setAuthed(false); renderView(); });

  const rankingEditor = $("rankingsEditor");
  let draggingRow = null;
  if (rankingEditor) {
    rankingEditor.addEventListener("dragstart", (e) => {
      const row = e.target.closest("[data-ranking-row]");
      if (!row) return;
      draggingRow = row;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    rankingEditor.addEventListener("dragend", () => {
      draggingRow?.classList.remove("dragging");
      draggingRow = null;
      renumberRankingEditor();
    });
    rankingEditor.addEventListener("dragover", (e) => {
      e.preventDefault();
      const row = e.target.closest("[data-ranking-row]");
      if (!row || !draggingRow || row === draggingRow) return;
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      if (before) row.parentNode.insertBefore(draggingRow, row);
      else row.parentNode.insertBefore(draggingRow, row.nextSibling);
      renumberRankingEditor();
    });
    rankingEditor.addEventListener("click", (e) => {
      const row = e.target.closest("[data-ranking-row]");
      if (!row) return;
      if (e.target.closest('.rank-up')) moveRankingRow(row, -1);
      if (e.target.closest('.rank-down')) moveRankingRow(row, 1);
      if (e.target.closest('.rank-remove')) { row.remove(); renumberRankingEditor(); }
    });
  }

  $("addRankingBtn")?.addEventListener("click", () => {
    const editor = $("rankingsEditor");
    if (!editor) return;
    const firstTeam = Object.keys(state.data.teams || {})[0] || "";
    const newRowWrap = document.createElement('div');
    newRowWrap.innerHTML = rankingEditorRowHtml({ slug: firstTeam, note: "" }, editor.querySelectorAll('[data-ranking-row]').length);
    editor.appendChild(newRowWrap.firstElementChild);
    renumberRankingEditor();
  });

  $("resetRankingsBtn")?.addEventListener("click", () => {
    const editor = $("rankingsEditor");
    if (!editor) return;
    editor.innerHTML = rankingRowsFromState().map((row, idx) => rankingEditorRowHtml(row, idx)).join('');
    renumberRankingEditor();
  });

  $("saveAllBtn")?.addEventListener("click", () => {
    try {
      const data = clone(state.data);
      data.site.name = $("siteNameInput")?.value || data.site.name;
      data.site.season = $("seasonInput")?.value || data.site.season;
      data.site.subtitle = $("subtitleInput")?.value || data.site.subtitle;
      data.site.currentWeek = Number($("currentWeekInput")?.value || data.site.currentWeek || 1);

      const div = divBySlug(state.adminDivision);
      const week = div?.weeks?.[Math.max(0, state.adminWeek - 1)];
      if (div && week) {
        week.cells.forEach((cell, idx) => {
          if (cell.bye) return;
          const status = $(`.gameStatus[data-idx="${idx}"]`)?.value || cell.status || "upcoming";
          const sf = $(`.gameFor[data-idx="${idx}"]`)?.value;
          const sa = $(`.gameAgainst[data-idx="${idx}"]`)?.value;
          cell.status = status;
          cell.played = status === "final";
          cell.scoreFor = sf === "" ? null : Number(sf);
          cell.scoreAgainst = sa === "" ? null : Number(sa);
        });
        buildGamePairUpdates(data, div.slug, Number(state.adminWeek || 1));
      }

      const team = data.teams[state.adminTeam];
      if (team) {
        team.headCoach = $("headCoachInput")?.value || "";
        team.assistantCoach = $("assistantCoachInput")?.value || "";
        team.notes = $("notesInput")?.value || "";
        team.logo = $("teamLogoInput")?.value || team.logo || "";
      }

      data.rankings = collectRankingsFromEditor();
      try { data.awards = JSON.parse($("awardsInput")?.value || "[]"); } catch {}
      try { data.history = JSON.parse($("historyInput")?.value || "[]"); } catch {}
      try { data.hallOfFame = JSON.parse($("hofInput")?.value || "[]"); } catch {}

      const json = $("jsonEditor");
      if (json) {
        try {
          const parsed = JSON.parse(json.value);
          parsed.site = data.site;
          parsed.divisions = data.divisions;
          parsed.teams = data.teams;
          parsed.rankings = data.rankings;
          parsed.awards = data.awards;
          parsed.history = data.history;
          parsed.hallOfFame = data.hallOfFame;
          state.data = normalizeData(parsed);
          saveData(state.data);
          json.value = JSON.stringify(state.data, null, 2);
        } catch (err) {
          state.data = normalizeData(data);
          saveData(state.data);
          if (status) status.textContent = `Saved, but raw JSON had an issue so the quick edits were used instead: ${err.message}`;
          renderView();
          return;
        }
      } else {
        state.data = normalizeData(data);
        saveData(state.data);
      }
      if (status) status.textContent = "Saved to browser localStorage.";
      renderView();
    } catch (err) {
      if (status) status.textContent = `Save failed: ${err.message}`;
    }
  });

  $("exportJsonBtn")?.addEventListener("click", () => {
    try {
      const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ntfl-site-data.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (status) status.textContent = "Exported JSON.";
    } catch (err) {
      if (status) status.textContent = `Export failed: ${err.message}`;
    }
  });

  $("resetJsonBtn")?.addEventListener("click", async () => {
    localStorage.removeItem(STORAGE_KEY);
    state.data = await loadData();
    if (status) status.textContent = "Reset from file data.";
    render();
  });

  $("importJsonFile")?.addEventListener("change", async () => {
    const file = $("importJsonFile")?.files?.[0];
    if (!file) return;
    try {
      const parsed = normalizeData(JSON.parse(await file.text()));
      saveData(parsed);
      if (status) status.textContent = "Imported JSON.";
      renderView();
    } catch (err) {
      if (status) status.textContent = `Import failed: ${err.message}`;
    }
  });
}

function render() {
  parseHash();
  renderView();
}

async function init() {
  state.data = await loadData();
  document.getElementById("app").innerHTML = shellHtml();
  loadImageWithFallback($("brandLogo"));
  render();
  window.addEventListener("hashchange", render);
}

init().catch(err => {
  document.getElementById("app").innerHTML = `<div class="container" style="padding:24px"><div class="card"><h2>Could not load NTFL site</h2><div class="notice">${esc(err.message)}</div></div></div>`;
});
