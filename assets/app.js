
const BASE_KEY = "ntfl-site-data";
const DATA_URL = "data/site-data.json";

const state = {
  data: null,
  route: {},
  search: "",
  selectedDivision: "",
  adminText: "",
};

function byId(id){ return document.getElementById(id); }
function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
}
function slugify(s){
  return String(s ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}
function teamBySlug(slug){ return state.data.teams[slug]; }
function teamsArray(){ return Object.values(state.data.teams); }
function divisionBySlug(slug){ return state.data.divisions.find(d => d.slug === slug); }
function currentWeek(){ return Number(state.data?.site?.currentWeek || 1); }

function loadImageWithFallback(img){
  img.onerror = () => {
    if (img.dataset.fallbackUsed !== "1") {
      img.dataset.fallbackUsed = "1";
      img.src = "assets/logo.svg";
    }
  };
}

async function loadData(){
  const stored = localStorage.getItem(BASE_KEY);
  if (stored) {
    try { return JSON.parse(stored); } catch(e) {}
  }
  const res = await fetch(DATA_URL, {cache:"no-store"});
  if (!res.ok) throw new Error("Could not load data file");
  return await res.json();
}

function formatRecord(team){
  return `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""}`;
}

function resultPill(result){
  if (result === "W") return `<span class="badge win">W</span>`;
  if (result === "L") return `<span class="badge loss">L</span>`;
  if (result === "T") return `<span class="badge tbd">T</span>`;
  return `<span class="badge tbd">—</span>`;
}

function navHtml(){
  return `
    <a href="#/">Home</a>
    <a href="#/teams">Teams</a>
    <a href="#/schedule">Schedule</a>
    <a href="#/standings">Standings</a>
    <a href="#/rankings">Rankings</a>
    <div class="dropdown" id="moreDropdown">
      <button type="button" id="moreButton">More ▾</button>
      <div class="dropdown-panel">
        <a href="#/awards">Awards</a>
        <a href="#/history">History</a>
        <a href="#/hof">Hall of Fame</a>
      </div>
    </div>
    <a href="#/admin">Admin</a>
  `;
}

function renderShell(){
  const root = byId("app");
  root.innerHTML = `
    <div class="shell">
      <div class="topbar">
        <div class="container topbar-inner">
          <a class="brand" href="#/">
            <img id="brandLogo" src="assets/IMG_5900.png" alt="NTFL logo">
            <div class="meta">
              <div>${escapeHtml(state.data.site.name)} <span class="muted">${escapeHtml(state.data.site.season)}</span></div>
              <span>${escapeHtml(state.data.site.subtitle || "Editable league hub")}</span>
            </div>
          </a>
          <nav class="nav" id="navLinks">${navHtml()}</nav>
        </div>
      </div>
      <main class="container" id="view"></main>
      <div class="container footer">
        <div class="divider"></div>
        <div>NTFL schedule note: numbers in parentheses are scores. Example: <strong>vs Chargers (62-112)</strong> means the team scored 62 and lost to the Chargers 112-62.</div>
      </div>
    </div>
  `;
  loadImageWithFallback(byId("brandLogo"));
  const more = byId("moreButton");
  if (more) {
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      byId("moreDropdown").classList.toggle("open");
    });
    document.addEventListener("click", () => byId("moreDropdown").classList.remove("open"));
  }
}

function hero(sectionTitle, title, subtitle, kicker){
  return `
    <section class="hero">
      <div class="hero-card">
        <span class="kicker">${escapeHtml(kicker || "NTFL")}</span>
        <h1 class="title">${escapeHtml(title)}</h1>
        <div class="subtitle">${subtitle}</div>
      </div>
    </section>
  `;
}

function statCards(cards){
  return `<section class="section"><div class="grid cols-4">${cards.map(c=>`
    <div class="card stat">
      <div class="muted small">${escapeHtml(c.label)}</div>
      <strong>${escapeHtml(c.value)}</strong>
      <div class="muted small">${escapeHtml(c.help || "")}</div>
    </div>
  `).join("")}</div></section>`;
}

function homeView(){
  const sorted = standingsData();
  const latestGames = [];
  for (const team of teamsArray()) {
    for (const g of team.schedule) {
      if (g.played && g.week <= currentWeek()) {
        latestGames.push({team: team.name, ...g});
      }
    }
  }
  latestGames.sort((a,b) => b.week - a.week);
  const featured = latestGames.slice(0,4);
  const topTeams = sorted.slice(0,4);
  return `
    ${hero("Home", `${state.data.site.name} Week ${currentWeek()}`, "A mobile-friendly league hub with team pages, PPG, awards, history, and editable admin controls. Click any team name anywhere to open its rundown.", "Week "+currentWeek())}
    ${statCards([
      {label:"Teams", value:Object.keys(state.data.teams).length, help:"All teams are clickable"},
      {label:"Divisions", value:state.data.divisions.length, help:"AFC and NFC"},
      {label:"Current Week", value:currentWeek(), help:"Schedule focus"},
      {label:"Played Games", value:featured.length, help:"Completed score entries"}
    ])}
    <section class="section">
      <div class="grid cols-2">
        <div class="card">
          <h2>Top of the table</h2>
          <table>
            <thead><tr><th>Rank</th><th>Team</th><th>Record</th><th>Diff</th></tr></thead>
            <tbody>
              ${topTeams.map(t => `
                <tr>
                  <td>${t.rank}</td>
                  <td><a href="#/team/${t.slug}">${escapeHtml(t.team)}</a></td>
                  <td>${escapeHtml(t.record)}</td>
                  <td>${t.pointDiff >= 0 ? "+" : ""}${t.pointDiff}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div class="card">
          <h2>Latest completed games</h2>
          ${featured.length ? featured.map(g => `
            <div class="row" style="justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)">
              <div>
                <div><a href="#/team/${slugify(g.team)}"><strong>${escapeHtml(g.team)}</strong></a> ${escapeHtml(g.raw)}</div>
                <div class="muted small">${escapeHtml(g.weekLabel)} • ${g.home ? "Home" : "Away"} • ${g.opponent ? "vs " + escapeHtml(g.opponent) : ""}</div>
              </div>
              <div>${resultPill(g.result)} ${g.played ? `<strong>${g.scoreFor}-${g.scoreAgainst}</strong>` : ""}</div>
            </div>
          `).join("") : `<div class="notice">No completed games yet.</div>`}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="card">
        <h2>Teams by division</h2>
        <div class="grid cols-2">
          ${state.data.divisions.map(div => `
            <div class="card" style="background:rgba(255,255,255,.02)">
              <h3>${escapeHtml(div.name)}</h3>
              <div class="row">
                ${div.teams.map(s => `<a class="pill" href="#/team/${s}">${escapeHtml(teamBySlug(s).name)}</a>`).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function teamsView(){
  const q = state.search.toLowerCase();
  const groups = state.data.divisions.map(div => {
    const teams = div.teams.map(slug => teamBySlug(slug)).filter(t => !q || t.name.toLowerCase().includes(q) || (t.headCoach||"").toLowerCase().includes(q) || (t.assistantCoach||"").toLowerCase().includes(q));
    return {name: div.name, slug: div.slug, teams};
  }).filter(g => g.teams.length);
  return `
    ${hero("Teams", "Click any team for a full rundown", "Each team page includes overview, schedule, PPG, coaching staff, and team notes. Search by team name or coach.", "Teams")}
    <section class="section">
      <div class="card">
        <input class="search" id="teamSearch" placeholder="Search team or coach..." value="${escapeHtml(state.search)}">
      </div>
    </section>
    ${groups.map(group => `
      <section class="section">
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <h2>${escapeHtml(group.name)}</h2>
            <a class="pill" href="#/schedule/${group.slug}">View schedule</a>
          </div>
          <div class="team-list">
            ${group.teams.map(team => `
              <a class="team-card" href="#/team/${team.slug}">
                <div class="pill">${escapeHtml(team.divisionName)}</div>
                <div class="name">${escapeHtml(team.name)}</div>
                <div class="division">${escapeHtml(team.headCoach || "Head coach TBD")}</div>
                <div class="muted small">${escapeHtml(formatRecord(team))} • ${team.pointsFor} PF • ${team.pointsAgainst} PA</div>
              </a>
            `).join("")}
          </div>
        </div>
      </section>
    `).join("")}
  `;
}

function teamView(slug){
  const team = teamBySlug(slug);
  if (!team) return `<section class="section"><div class="card">Team not found.</div></section>`;
  const tabs = ["overview","schedule","ppg","coaches","notes"];
  return `
    ${hero("Team", team.name, `${team.divisionName} • Click through tabs for a full rundown of the team.`, team.divisionName)}
    <section class="section">
      <div class="card">
        <div class="row">
          <span class="pill">${escapeHtml(team.divisionName)}</span>
          <span class="pill">Record: ${escapeHtml(formatRecord(team))}</span>
          <span class="pill">PF ${team.pointsFor}</span>
          <span class="pill">PA ${team.pointsAgainst}</span>
          <span class="pill">PPG ${team.ppg.toFixed(1)}</span>
          <span class="pill">OPPG ${team.oppg.toFixed(1)}</span>
          <span class="pill">Diff ${team.pointDiff >= 0 ? "+" : ""}${team.pointDiff}</span>
        </div>
        <div class="tabs" id="teamTabs">
          ${tabs.map((t,i) => `<button class="tab ${i===0 ? "active" : ""}" data-tab="${t}">${t.toUpperCase()}</button>`).join("")}
        </div>

        <div class="panel active" data-panel="overview">
          <div class="grid cols-2">
            <div class="card">
              <h3>Season rundown</h3>
              <div class="muted">Current record, scoring profile, and last five games.</div>
              <div class="divider"></div>
              <div class="row">
                <span class="pill">Games played: ${team.gamesPlayed}</span>
                <span class="pill">Streak: ${team.streak || "—"}</span>
              </div>
              <div style="height:12px"></div>
              <div>${team.last5.length ? team.last5.map(g => `
                <div class="row" style="justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)">
                  <div>
                    <strong>${escapeHtml(g.week)} — ${escapeHtml(g.opponent || "TBD")}</strong>
                    <div class="muted small">${g.scoreFor != null ? `${g.scoreFor}-${g.scoreAgainst}` : "No score yet"}</div>
                  </div>
                  <div>${resultPill(g.result)}</div>
                </div>
              `).join("") : `<div class="notice">No completed games yet.</div>`}</div>
            </div>
            <div class="card">
              <h3>Quick notes</h3>
              <div class="notice">${escapeHtml(team.notes || "Add notes in the admin dashboard.")}</div>
            </div>
          </div>
        </div>

        <div class="panel" data-panel="schedule">
          <h3>Full schedule</h3>
          <table>
            <thead><tr><th>Week</th><th>Matchup</th><th>Result</th><th>Score</th></tr></thead>
            <tbody>
              ${team.schedule.map(g => `
                <tr class="${g.week === currentWeek() ? "current" : ""}">
                  <td>${escapeHtml("W" + g.week)}</td>
                  <td>${escapeHtml(g.raw)}</td>
                  <td>${g.raw === "BYE" ? `<span class="muted">BYE</span>` : (g.played ? `<span class="${g.result === "W" ? "result-win" : g.result === "L" ? "result-loss" : ""}">${g.result || "TBD"}</span>` : `<span class="muted">TBD</span>`)}</td>
                  <td>${g.played ? `${g.scoreFor}-${g.scoreAgainst}` : "—"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <div class="panel" data-panel="ppg">
          <div class="grid cols-3">
            <div class="card stat"><div class="muted small">Offense PPG</div><strong>${team.ppg.toFixed(1)}</strong><div class="muted small">Points scored per completed game</div></div>
            <div class="card stat"><div class="muted small">Defense PPG</div><strong>${team.oppg.toFixed(1)}</strong><div class="muted small">Points allowed per completed game</div></div>
            <div class="card stat"><div class="muted small">Point Differential</div><strong>${team.pointDiff >= 0 ? "+" : ""}${team.pointDiff}</strong><div class="muted small">Total scoring margin</div></div>
          </div>
          <div style="height:14px"></div>
          <div class="notice">This tab is built for the points-per-game view you asked for. It updates from the schedule scores that are already entered.</div>
        </div>

        <div class="panel" data-panel="coaches">
          <div class="grid cols-2">
            <div class="card"><h3>Head coach</h3><div class="pill">${escapeHtml(team.headCoach || "TBD")}</div></div>
            <div class="card"><h3>Assistant coach</h3><div class="pill">${escapeHtml(team.assistantCoach || "—")}</div></div>
          </div>
        </div>

        <div class="panel" data-panel="notes">
          <div class="card">
            <h3>Team rundown</h3>
            <div class="notice">${escapeHtml(team.notes || "Add a custom rundown in Admin.")}</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function scheduleView(slug){
  const div = slug ? divisionBySlug(slug) : state.data.divisions[0];
  if (!div) return `<section class="section"><div class="card">Schedule not found.</div></section>`;
  return `
    ${hero("Schedule", `${div.name} schedule`, "Scores in parentheses show completed games. Week 3 is highlighted so it is easy to track where the season is right now.", div.name)}
    <section class="section">
      <div class="card">
        <div class="row">
          ${state.data.divisions.map(d => `<a class="chip-btn" href="#/schedule/${d.slug}">${escapeHtml(d.name)}</a>`).join("")}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Week</th>
              ${div.weeks[0].cells.map(c => `<th><a href="#/team/${slugify(c.team)}">${escapeHtml(c.team)}</a></th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${div.weeks.map(w => `
              <tr class="${w.week === "W"+currentWeek() ? "current" : ""}">
                <td>${escapeHtml(w.week)}</td>
                ${w.cells.map(c => {
                  const parsed = teamBySlug(slugify(c.team));
                  const bye = c.raw === "BYE";
                  const isPlayed = !!c.played;
                  const result = c.raw === "BYE" ? "bye" : (isPlayed ? (c.scoreFor > c.scoreAgainst ? "win" : c.scoreFor < c.scoreAgainst ? "loss" : "tbd") : "tbd");
                  return `<td>
                    <div class="row" style="justify-content:space-between;align-items:center">
                      <a href="#/team/${slugify(c.team)}"><strong>${escapeHtml(c.raw)}</strong></a>
                      ${bye ? `<span class="muted small">BYE</span>` : isPlayed ? `<span class="badge ${result}">${result === "win" ? "W" : result === "loss" ? "L" : "T"}</span>` : `<span class="badge tbd">—</span>`}
                    </div>
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

function standingsData(){
  const arr = teamsArray().map(t => {
    const gp = t.gamesPlayed || 0;
    const pct = gp ? (t.wins + 0.5*t.ties)/gp : 0;
    return {...t, pct};
  });
  arr.sort((a,b) => (b.pct - a.pct) || (b.pointDiff - a.pointDiff) || (b.pointsFor - a.pointsFor) || a.name.localeCompare(b.name));
  return arr.map((t,i) => ({rank:i+1, slug:t.slug, team:t.name, division:t.divisionName, record:formatRecord(t), wins:t.wins, losses:t.losses, ties:t.ties, pct:t.pct, pointsFor:t.pointsFor, pointsAgainst:t.pointsAgainst, pointDiff:t.pointDiff}));
}

function standingsView(){
  const rows = standingsData();
  return `
    ${hero("Standings", "League standings", "Auto-calculated from the schedule scores that are already entered. Teams are clickable from the table.", "Standings")}
    <section class="section">
      <div class="card">
        <table>
          <thead><tr><th>#</th><th>Team</th><th>Div</th><th>Record</th><th>PF</th><th>PA</th><th>Diff</th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.rank}</td>
                <td><a href="#/team/${r.slug}">${escapeHtml(r.team)}</a></td>
                <td>${escapeHtml(r.division)}</td>
                <td>${escapeHtml(r.record)}</td>
                <td>${r.pointsFor}</td>
                <td>${r.pointsAgainst}</td>
                <td>${r.pointDiff >= 0 ? "+" : ""}${r.pointDiff}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function rankingsView(){
  return `
    ${hero("Rankings", "Power rankings", "This tab is seeded from the current schedule data and can be edited in Admin by replacing the JSON.", "Rankings")}
    <section class="section">
      <div class="card">
        <table>
          <thead><tr><th>#</th><th>Team</th><th>Record</th><th>PF</th><th>PA</th><th>Diff</th></tr></thead>
          <tbody>
            ${state.data.rankings.map(r => `
              <tr>
                <td>${r.rank}</td>
                <td><a href="#/team/${r.slug}">${escapeHtml(r.team)}</a></td>
                <td>${escapeHtml(r.record)}</td>
                <td>${r.pointsFor}</td>
                <td>${r.pointsAgainst}</td>
                <td>${r.pointDiff >= 0 ? "+" : ""}${r.pointDiff}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function awardsView(){
  return `
    ${hero("Awards", "League awards", "Edit these in Admin. The page is ready for MVP, OPOY, DPOY, ROTY, and Coach of the Year.", "Awards")}
    <section class="section">
      <div class="grid cols-2">
        ${state.data.awards.map(a => `
          <div class="card">
            <h3>${escapeHtml(a.category)}</h3>
            <div class="pill">${escapeHtml(a.winner)} • ${escapeHtml(a.team)}</div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function historyView(){
  return `
    ${hero("History", "League history", "A simple timeline page for champions, records, and legacy notes.", "History")}
    <section class="section">
      <div class="grid cols-2">
        ${state.data.history.map(h => `
          <div class="card">
            <h3>${escapeHtml(h.season)}</h3>
            <div class="row"><span class="pill">Champion: ${escapeHtml(h.champion)}</span><span class="pill">Record: ${escapeHtml(h.record)}</span></div>
            <div style="height:10px"></div>
            <div class="muted">${escapeHtml(h.notes || "")}</div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function hofView(){
  return `
    ${hero("Hall of Fame", "Hall of Fame", "Placeholder page ready for legends, jerseys, and big moments.", "HOF")}
    <section class="section"><div class="card notice">You can fill this page later from the admin JSON, or leave it as a future section for NTFL legends.</div></section>
  `;
}

function adminView(){
  const txt = JSON.stringify(state.data, null, 2);
  return `
    ${hero("Admin", "Editable dashboard", "Use this dashboard to edit everything in one JSON file. Save it locally for testing, then export and upload the JSON so others can see the changes too.", "Admin")}
    <section class="section">
      <div class="grid cols-2">
        <div class="card">
          <h3>Quick controls</h3>
          <div class="grid cols-2">
            <div><label class="small muted">Site name</label><input id="siteNameInput" value="${escapeHtml(state.data.site.name)}"></div>
            <div><label class="small muted">Current week</label><input id="currentWeekInput" type="number" min="1" max="18" value="${escapeHtml(state.data.site.currentWeek)}"></div>
          </div>
          <div class="divider"></div>
          <div class="actions">
            <button class="chip-btn primary" id="saveJsonBtn">Save to browser</button>
            <button class="chip-btn secondary" id="exportJsonBtn">Export JSON</button>
            <label class="chip-btn secondary" for="importJsonFile" style="cursor:pointer">Import JSON</label>
            <input id="importJsonFile" type="file" accept=".json" class="hidden">
            <button class="chip-btn secondary" id="resetJsonBtn">Reset from file</button>
          </div>
          <div style="height:12px"></div>
          <div class="notice">For everyone to see edits, export the JSON after saving and replace <code>data/site-data.json</code> in the site files.</div>
          <div class="divider"></div>
          <div class="row">
            <span class="pill">Teams: ${Object.keys(state.data.teams).length}</span>
            <span class="pill">Divisions: ${state.data.divisions.length}</span>
            <span class="pill">Awards: ${state.data.awards.length}</span>
            <span class="pill">History entries: ${state.data.history.length}</span>
          </div>
        </div>
        <div class="card">
          <h3>JSON editor</h3>
          <textarea id="jsonEditor">${escapeHtml(txt)}</textarea>
          <div class="muted small" id="adminStatus" style="margin-top:10px"></div>
        </div>
      </div>
    </section>
  `;
}

function parseHash(){
  const hash = location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  const page = parts[0] || "";
  const slug = parts[1] || "";
  state.route = {page, slug};
}

function setActiveTab(tab){
  document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach(panel => panel.classList.toggle("active", panel.dataset.panel === tab));
}

function bindTeamTabs(){
  const tabs = document.getElementById("teamTabs");
  if (!tabs) return;
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    setActiveTab(btn.dataset.tab);
  });
}

function bindTeamSearch(){
  const input = document.getElementById("teamSearch");
  if (!input) return;
  input.addEventListener("input", () => {
    state.search = input.value;
    render();
  });
}

function bindAdmin(){
  const saveBtn = byId("saveJsonBtn");
  const exportBtn = byId("exportJsonBtn");
  const importInput = byId("importJsonFile");
  const resetBtn = byId("resetJsonBtn");
  const editor = byId("jsonEditor");
  const status = byId("adminStatus");
  const siteNameInput = byId("siteNameInput");
  const currentWeekInput = byId("currentWeekInput");

  if (siteNameInput) {
    siteNameInput.addEventListener("input", () => {
      try {
        const obj = JSON.parse(editor.value);
        obj.site.name = siteNameInput.value;
        editor.value = JSON.stringify(obj, null, 2);
      } catch {}
    });
  }
  if (currentWeekInput) {
    currentWeekInput.addEventListener("input", () => {
      try {
        const obj = JSON.parse(editor.value);
        obj.site.currentWeek = Number(currentWeekInput.value || 1);
        editor.value = JSON.stringify(obj, null, 2);
      } catch {}
    });
  }

  saveBtn?.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(editor.value);
      localStorage.setItem(BASE_KEY, JSON.stringify(parsed));
      status.textContent = "Saved to browser localStorage.";
      state.data = parsed;
      render();
    } catch (e) {
      status.textContent = "JSON error: " + e.message;
    }
  });

  exportBtn?.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(editor.value);
      const blob = new Blob([JSON.stringify(parsed, null, 2)], {type:"application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ntfl-site-data.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "Exported JSON file.";
    } catch (e) {
      status.textContent = "JSON error: " + e.message;
    }
  });

  importInput?.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      editor.value = JSON.stringify(parsed, null, 2);
      localStorage.setItem(BASE_KEY, JSON.stringify(parsed));
      state.data = parsed;
      status.textContent = "Imported and saved JSON.";
      render();
    } catch (e) {
      status.textContent = "Import error: " + e.message;
    }
  });

  resetBtn?.addEventListener("click", async () => {
    localStorage.removeItem(BASE_KEY);
    status.textContent = "Reset browser override. Reloading from file...";
    state.data = await loadData();
    render();
  });
}

function render(){
  parseHash();
  const view = byId("view");
  const p = state.route.page;
  let html = "";
  if (p === "" || p === "home") html = homeView();
  else if (p === "teams") html = teamsView();
  else if (p === "team") html = teamView(state.route.slug);
  else if (p === "schedule") html = scheduleView(state.route.slug);
  else if (p === "standings") html = standingsView();
  else if (p === "rankings") html = rankingsView();
  else if (p === "awards") html = awardsView();
  else if (p === "history") html = historyView();
  else if (p === "hof") html = hofView();
  else if (p === "admin") html = adminView();
  else html = `<section class="section"><div class="card">Page not found.</div></section>`;
  view.innerHTML = html;
  bindTeamTabs();
  bindTeamSearch();
  bindAdmin();
}

async function init(){
  state.data = await loadData();
  renderShell();
  render();
  window.addEventListener("hashchange", render);
}

init().catch(err => {
  document.getElementById("app").innerHTML = `<div class="container" style="padding:24px"><div class="card"><h2>Could not load NTFL site</h2><div class="notice">${escapeHtml(err.message)}</div></div></div>`;
});
