
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_NAME, SEASON_LABEL } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const page = document.body.dataset.page;
const app = document.getElementById("app");
const state = { teams: [], schedule: [], rankings: [], news: [], awards: [], history: [], settings: {}, session: null };

const fmtNum = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) || n === "" ? "—" : Number(n));
const pct = (w,l,t) => {
  const games = Number(w||0)+Number(l||0)+Number(t||0);
  return games ? ((Number(w||0) + 0.5*Number(t||0)) / games).toFixed(3) : ".000";
};
const initials = (name) => String(name || "?").split(" ").map(v => v[0]).join("").slice(0,2).toUpperCase();
const escapeHtml = (str="") => String(str).replace(/[&<>"']/g, s => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]));
const teamLookup = (name) => state.teams.find(t => t.name === name) || { name, coach_name:"", division:"", conference:"", wins:0, losses:0, ties:0, logo_url:"" };
const record = (t) => `${t.wins||0}-${t.losses||0}${(t.ties||0) ? `-${t.ties}` : ""}`;

function renderLogo(team, size="54px") {
  const bg = team.primary_color || "#0b1422";
  const fg = team.secondary_color || "#60a5fa";
  if (team.logo_url) {
    return `<div class="logo" style="width:${size};height:${size};background:${bg};border-color:${fg}33"><img src="${escapeHtml(team.logo_url)}" alt="${escapeHtml(team.name)} logo"/></div>`;
  }
  return `<div class="logo" style="width:${size};height:${size};background:linear-gradient(135deg, ${bg}, #12223c);border-color:${fg}33;color:${fg}">${initials(team.name)}</div>`;
}

function navActive() {
  const current = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach(a => {
    const href = a.getAttribute("href")?.replace("./","");
    if (href === current) a.classList.add("active");
  });
}

async function loadAll() {
  const [{ data: teams }, { data: schedule }, { data: rankings }, { data: news }, { data: awards }, { data: history }, { data: settings }, { data: sessionData }] = await Promise.all([
    supabase.from("teams").select("*").order("name"),
    supabase.from("schedule_games").select("*").order("week_number", { ascending: true }).order("home_team_name", { ascending: true }),
    supabase.from("rankings").select("*").order("week", { ascending: false }).order("rank", { ascending: true }),
    supabase.from("news").select("*").order("published_at", { ascending: false }),
    supabase.from("awards").select("*").order("updated_at", { ascending: false }),
    supabase.from("history_items").select("*").order("updated_at", { ascending: false }),
    supabase.from("site_settings").select("*"),
    supabase.auth.getSession(),
  ]);
  state.teams = teams || [];
  state.schedule = schedule || [];
  state.rankings = rankings || [];
  state.news = news || [];
  state.awards = awards || [];
  state.history = history || [];
  state.settings = Object.fromEntries((settings || []).map(r => [r.key, r.value]));
  state.session = sessionData?.session || null;
}
function liveGames() { return state.schedule.filter(g => g.is_live || g.status === "live"); }
function upcomingGames() { return state.schedule.filter(g => g.status === "scheduled").slice(0, 8); }
function featuredGame() { return liveGames()[0] || upcomingGames()[0] || state.schedule[0]; }
function latestNews() { return state.news.slice(0, 3); }
function rankingsTop(n=5) {
  const week = Math.max(...state.rankings.map(r => Number(r.week) || 0), 1);
  return state.rankings.filter(r => Number(r.week) === week).sort((a,b) => Number(a.rank)-Number(b.rank)).slice(0, n);
}
function standingsRows() {
  return [...state.teams].sort((a,b) => {
    const p1 = Number(pct(a.wins,a.losses,a.ties));
    const p2 = Number(pct(b.wins,b.losses,b.ties));
    if (p2 !== p1) return p2 - p1;
    return Number(b.wins||0) - Number(a.wins||0);
  });
}
function divisionGroups() {
  const groups = {};
  for (const t of state.teams) {
    const key = `${t.conference || ""} ${t.division || ""}`.trim();
    groups[key] = groups[key] || [];
    groups[key].push(t);
  }
  Object.values(groups).forEach(list => list.sort((a,b) => Number(pct(b.wins,b.losses,b.ties)) - Number(pct(a.wins,a.losses,a.ties))));
  return groups;
}
function renderGameCard(g, featured=false) {
  if (!g) return `<div class="empty">No featured game.</div>`;
  const ht = teamLookup(g.home_team_name), at = teamLookup(g.away_team_name);
  return `
    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:center">
      <div style="display:flex;gap:10px;align-items:center">
        ${renderLogo(at)}
        <div><div class="team-name">${escapeHtml(at.name)}</div><div class="muted small">${escapeHtml(at.coach_name || "")}</div></div>
      </div>
      <div class="pill ${g.status === 'live' || g.is_live ? 'live' : g.status}">${g.is_live || g.status==="live" ? "LIVE" : escapeHtml(g.week)}</div>
      <div style="display:flex;gap:10px;align-items:center;justify-content:flex-end">
        <div style="text-align:right"><div class="team-name">${escapeHtml(ht.name)}</div><div class="muted small">${escapeHtml(ht.coach_name || "")}</div></div>
        ${renderLogo(ht)}
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;gap:10px;flex-wrap:wrap">
      <div><b>${escapeHtml(g.away_team_name)}</b> ${fmtNum(g.away_score)} · ${fmtNum(g.home_score)} <b>${escapeHtml(g.home_team_name)}</b></div>
      <a class="btn ${featured ? 'good' : ''}" href="./game.html?week=${encodeURIComponent(g.week)}&home=${encodeURIComponent(g.home_team_name)}&away=${encodeURIComponent(g.away_team_name)}">Open Game Center</a>
    </div>
  `;
}
function renderHome() {
  const banner = state.settings.season_banner || { title: `${SEASON_LABEL} Week 1`, subtitle: APP_NAME };
  const home = state.settings.home_banner || { headline: "Where the NTFL collides" };
  const live = liveGames();
  app.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div class="panel">
          <div class="eyebrow">⚡ ${escapeHtml(banner.title || `${SEASON_LABEL}`)} · ${escapeHtml(banner.subtitle || APP_NAME)}</div>
          <h1>${escapeHtml(home.headline || "Where the NTFL collides")}</h1>
          <p>Teams, coaches, standings, rankings, schedule, news, awards, and history are all wired to Supabase.</p>
          <div class="actions">
            <a class="btn primary" href="./schedule.html">View schedule</a>
            <a class="btn" href="./standings.html">Standings</a>
            <a class="btn" href="./admin.html">Commissioner dashboard</a>
          </div>
          <div class="grid grid-4" style="margin-top:18px">
            <div class="stat"><b>${state.teams.length}</b><span class="muted">Teams</span></div>
            <div class="stat"><b>${state.schedule.length}</b><span class="muted">Games loaded</span></div>
            <div class="stat"><b>${state.news.length}</b><span class="muted">News items</span></div>
            <div class="stat"><b>${state.rankings.length}</b><span class="muted">Ranking rows</span></div>
          </div>
        </div>
        <div class="panel">
          <div class="kicker">Live Now</div>
          <h2>${live.length ? `${live.length} game(s) active` : "No live games right now"}</h2>
          <div class="ticker">
            ${(live.length ? live : upcomingGames().slice(0,4)).map(g => `
              <div class="ticker-item">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
                  <span class="badge ${g.status === 'live' || g.is_live ? 'live' : 'scheduled'}">${g.status === 'live' || g.is_live ? 'LIVE' : 'Scheduled'}</span>
                  <span class="muted">${escapeHtml(g.week)}</span>
                </div>
                <div style="margin-top:10px;font-weight:800">${escapeHtml(g.away_team_name)} at ${escapeHtml(g.home_team_name)}</div>
                <div class="muted small">${g.home_score ?? "—"} - ${g.away_score ?? "—"}</div>
              </div>
            `).join("") || `<div class="empty">No games yet.</div>`}
          </div>
          <div class="card" style="margin-top:12px">
            <div class="kicker">Featured Game</div>
            ${renderGameCard(featuredGame(), true)}
          </div>
        </div>
      </div>
    </section>
    <section class="section subgrid">
      <div>
        <div class="section-head"><div><div class="kicker">Latest News</div><h2>League updates</h2></div><a class="pill" href="./news.html">See all</a></div>
        <div class="grid">
          ${latestNews().map(n => `
            <article class="card">
              <div class="pill">${escapeHtml(n.category || "League")}</div>
              <h3 style="margin-top:10px">${escapeHtml(n.title)}</h3>
              <p>${escapeHtml(n.body).slice(0,180)}${n.body?.length > 180 ? "…" : ""}</p>
            </article>
          `).join("") || `<div class="empty">Add news posts in the commissioner dashboard.</div>`}
        </div>
      </div>
      <div class="stack">
        <div class="section-head"><div><div class="kicker">Top 5</div><h2>Power rankings</h2></div><a class="pill" href="./rankings.html">Full board</a></div>
        <div class="card">
          ${rankingsTop(5).map(r => `
            <div class="team-card" style="margin-bottom:12px">
              ${renderLogo(teamLookup(r.team_name))}
              <div>
                <div class="team-name">#${r.rank} ${escapeHtml(r.team_name)}</div>
                <div class="muted small">${escapeHtml(r.note || "")}</div>
              </div>
              <div class="pill">${r.previous_rank ? `Prev ${r.previous_rank}` : "new"}</div>
            </div>
          `).join("") || `<div class="empty">Add weekly rankings in the dashboard.</div>`}
        </div>
        <div class="section-head" style="margin-top:10px"><div><div class="kicker">Standings</div><h2>Top records</h2></div><a class="pill" href="./standings.html">All teams</a></div>
        <div class="card">
          ${standingsRows().slice(0,5).map(t => `
            <div class="team-card" style="margin-bottom:12px">
              ${renderLogo(t)}
              <div><div class="team-name">${escapeHtml(t.name)}</div><div class="muted small">${escapeHtml(t.division)} · ${record(t)} · Win% ${pct(t.wins,t.losses,t.ties)}</div></div>
              <div class="pill">${pct(t.wins,t.losses,t.ties)}</div>
            </div>
          `).join("")}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><div><div class="kicker">Quick Links</div><h2>League control</h2></div></div>
      <div class="grid grid-4">
        ${[
          ["Teams","teams.html"],["Schedule","schedule.html"],["Standings","standings.html"],["Game Center","game.html"]
        ].map(([label,href])=>`<a class="card" href="./${href}"><h3>${label}</h3><p>Open the ${label.toLowerCase()} page.</p></a>`).join("")}
      </div>
    </section>
  `;
}
function renderTeams() {
  app.innerHTML = `<section class="section"><div class="section-head"><div><div class="kicker">Teams</div><h2>Coaches, divisions, records</h2></div><div class="searchbar"><input id="teamSearch" class="input" placeholder="Search team or coach"/></div></div><div id="teamsGrid" class="grid grid-2"></div></section>`;
  const grid = document.getElementById("teamsGrid");
  const search = document.getElementById("teamSearch");
  const draw = () => {
    const term = search.value.toLowerCase().trim();
    const filtered = state.teams.filter(t => [t.name, t.coach_name, t.ac_name, t.division, t.conference].join(" ").toLowerCase().includes(term));
    grid.innerHTML = filtered.map(t => `<article class="card team-card">${renderLogo(t,"64px")}<div><div class="team-name">${escapeHtml(t.name)}</div><div class="muted small">${escapeHtml(t.coach_name || "")}${t.ac_name ? ` · AC ${escapeHtml(t.ac_name)}` : ""}</div><div class="muted small">${escapeHtml(t.conference)} · ${escapeHtml(t.division)} · ${record(t)} · Win% ${pct(t.wins,t.losses,t.ties)}</div></div><a class="pill" href="./game.html?team=${encodeURIComponent(t.name)}">Team page</a></article>`).join("") || `<div class="empty">No matching teams.</div>`;
  };
  search.addEventListener("input", draw); draw();
}
function renderSchedule() {
  const weeks = ["All", ...new Set(state.schedule.map(g => g.week))].sort((a,b) => a==="All" ? -1 : b==="All" ? 1 : Number(a.replace(/\D/g,"")) - Number(b.replace(/\D/g,"")));
  app.innerHTML = `<section class="section"><div class="section-head"><div><div class="kicker">Schedule</div><h2>Weekly games and live statuses</h2></div><select id="weekFilter" class="select" style="max-width:240px">${weeks.map(w => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join("")}</select></div><div id="scheduleList" class="stack"></div></section>`;
  const filter = document.getElementById("weekFilter"), list = document.getElementById("scheduleList");
  const draw = () => {
    const rows = (filter.value === "All" ? state.schedule : state.schedule.filter(g => g.week === filter.value)).slice(0, 120);
    list.innerHTML = rows.map(g => `<article class="card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><div><div class="pill ${g.status === 'live' || g.is_live ? 'live' : g.status}">${String(g.status || "scheduled").toUpperCase()}</div><h3 style="margin-top:10px">${escapeHtml(g.week)} · ${escapeHtml(g.away_team_name)} at ${escapeHtml(g.home_team_name)}</h3><p class="small">${escapeHtml(g.source_sheet || "")}</p></div><div class="right"><div style="font-size:1.4rem;font-weight:900">${fmtNum(g.away_score)} - ${fmtNum(g.home_score)}</div><a class="btn" href="./game.html?week=${encodeURIComponent(g.week)}&home=${encodeURIComponent(g.home_team_name)}&away=${encodeURIComponent(g.away_team_name)}">Open Game Center</a></div></div></article>`).join("") || `<div class="empty">No games found.</div>`;
  };
  filter.addEventListener("change", draw); draw();
}
function renderStandings() {
  const grouped = divisionGroups();
  app.innerHTML = `<section class="section"><div class="section-head"><div><div class="kicker">Standings</div><h2>Conference and division tables</h2></div></div><div class="stack">${Object.entries(grouped).map(([group, teams]) => `<article class="card"><h3>${escapeHtml(group)}</h3><table class="table"><thead><tr><th>Team</th><th>Coach</th><th>REC</th><th>Win%</th><th>PF</th><th>PA</th></tr></thead><tbody>${teams.map(t => `<tr><td><b>${escapeHtml(t.name)}</b></td><td>${escapeHtml(t.coach_name || "")}</td><td>${record(t)}</td><td>${pct(t.wins,t.losses,t.ties)}</td><td>${fmtNum(t.points_for)}</td><td>${fmtNum(t.points_against)}</td></tr>`).join("")}</tbody></table></article>`).join("")}</div></section>`;
}
function renderRankings() {
  const week = Math.max(...state.rankings.map(r => Number(r.week) || 0), 1);
  const rows = state.rankings.filter(r => Number(r.week) === week).sort((a,b) => Number(a.rank)-Number(b.rank));
  app.innerHTML = `<section class="section"><div class="section-head"><div><div class="kicker">Rankings</div><h2>Weekly power rankings</h2></div></div><div class="grid grid-2">${rows.map(r => { const t = teamLookup(r.team_name); return `<article class="card team-card">${renderLogo(t,"64px")}<div><div class="team-name">#${r.rank} ${escapeHtml(r.team_name)}</div><div class="muted small">${escapeHtml(r.note || "")}</div><div class="muted small">${escapeHtml(t.conference || "")} · ${escapeHtml(t.division || "")}</div></div><div class="pill">${r.previous_rank ? `Prev ${r.previous_rank}` : "—"}</div></article>`; }).join("") || `<div class="empty">No rankings loaded yet.</div>`}</div></section>`;
}
function renderNews() {
  app.innerHTML = `<section class="section"><div class="section-head"><div><div class="kicker">News</div><h2>League updates and announcements</h2></div></div><div class="stack">${state.news.map(n => `<article class="card"><div class="pill">${escapeHtml(n.category || "League")}</div><h3 style="margin-top:10px">${escapeHtml(n.title)}</h3><p>${escapeHtml(n.body)}</p><div class="muted small">${new Date(n.published_at).toLocaleString()}</div></article>`).join("") || `<div class="empty">No news yet.</div>`}</div></section>`;
}
function renderAwards() {
  app.innerHTML = `<section class="section"><div class="section-head"><div><div class="kicker">Awards</div><h2>Season honors</h2></div></div><div class="grid grid-2">${state.awards.map(a => `<article class="card"><div class="pill">${escapeHtml(a.season || "")}</div><h3 style="margin-top:10px">${escapeHtml(a.icon || "🏆")} ${escapeHtml(a.award_name)}</h3><p><b>${escapeHtml(a.winner)}</b></p><p>${escapeHtml(a.note || "")}</p></article>`).join("") || `<div class="empty">Add awards in the dashboard.</div>`}</div></section>`;
}
function renderHistory() {
  app.innerHTML = `<section class="section"><div class="section-head"><div><div class="kicker">History</div><h2>League archive</h2></div></div><div class="stack">${state.history.map(h => `<article class="card"><div class="pill">${escapeHtml(h.season || "")}</div><h3 style="margin-top:10px">${escapeHtml(h.title)}</h3><p>${escapeHtml(h.body)}</p></article>`).join("") || `<div class="empty">Add history notes in the dashboard.</div>`}</div></section>`;
}
function renderRules() {
  const rules = state.settings.rules || { title: "Rules", body: "Add league rules in the commissioner dashboard." };
  app.innerHTML = `<section class="section"><div class="panel"><div class="kicker">Rules</div><h2>${escapeHtml(rules.title || "Rules")}</h2><p>${escapeHtml(rules.body || "Add rules in the commissioner dashboard.")}</p></div></section>`;
}
function renderGame() {
  const params = new URLSearchParams(location.search);
  const week = params.get("week"), home = params.get("home"), away = params.get("away"), team = params.get("team");
  let game = null;
  if (week && home && away) game = state.schedule.find(g => g.week === week && g.home_team_name === home && g.away_team_name === away);
  else if (team) game = state.schedule.find(g => g.home_team_name === team || g.away_team_name === team);
  if (!game) game = featuredGame();
  const ht = teamLookup(game.home_team_name), at = teamLookup(game.away_team_name);
  app.innerHTML = `<section class="section"><div class="panel"><div class="kicker">Game Center</div><h2>${escapeHtml(game.week)} · ${escapeHtml(game.away_team_name)} at ${escapeHtml(game.home_team_name)}</h2><div class="grid grid-2" style="margin-top:16px"><article class="card"><div style="display:flex;gap:12px;align-items:center">${renderLogo(at,"72px")}<div><div class="team-name">${escapeHtml(at.name)}</div><div class="muted small">${escapeHtml(at.coach_name || "")}</div></div></div></article><article class="card"><div style="display:flex;gap:12px;align-items:center;justify-content:flex-end"><div style="text-align:right"><div class="team-name">${escapeHtml(ht.name)}</div><div class="muted small">${escapeHtml(ht.coach_name || "")}</div></div>${renderLogo(ht,"72px")}</div></article></div><div class="card" style="margin-top:14px"><div class="kicker">Scoreboard</div><div style="font-size:2.4rem;font-weight:900;margin-top:8px">${fmtNum(game.away_score)} - ${fmtNum(game.home_score)}</div><div class="pill ${game.is_live || game.status === 'live' ? 'live' : game.status}">${game.is_live || game.status === 'live' ? "LIVE" : escapeHtml(game.status)}</div></div></div></section>`;
}
function renderLoginBox(userText="") {
  app.innerHTML = `<section class="section"><div class="panel login-box"><div class="kicker">Commissioner dashboard</div><h2>Sign in</h2><div class="stack"><input id="email" class="input" placeholder="Email"/><input id="password" type="password" class="input" placeholder="Password"/><button id="loginBtn" class="btn primary">Log in</button><div id="loginMsg" class="note">${escapeHtml(userText)}</div></div></div></section>`;
  document.getElementById("loginBtn").onclick = async () => {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    document.getElementById("loginMsg").textContent = error ? error.message : "Signed in. Reloading…";
    if (!error) location.reload();
  };
}
function adminTeamEditor() {
  return `<article class="card"><div class="section-head"><div><div class="kicker">Teams</div><h2>Edit coaches, logos, records</h2></div></div><div class="editor-list">${state.teams.map(t => `<div class="editor-item" data-team="${escapeHtml(t.name)}"><div class="form-row"><input class="input" data-field="name" value="${escapeHtml(t.name)}" /><input class="input" data-field="coach_name" value="${escapeHtml(t.coach_name || "")}" placeholder="Coach"/><input class="input" data-field="division" value="${escapeHtml(t.division || "")}" placeholder="Division"/><input class="input" data-field="conference" value="${escapeHtml(t.conference || "")}" placeholder="Conference"/></div><div class="form-row" style="margin-top:10px"><input class="input" data-field="logo_url" value="${escapeHtml(t.logo_url || "")}" placeholder="Logo URL"/><input class="input" data-field="primary_color" value="${escapeHtml(t.primary_color || "")}" placeholder="Primary color"/><input class="input" data-field="secondary_color" value="${escapeHtml(t.secondary_color || "")}" placeholder="Secondary color"/><button class="btn primary save-team">Save team</button></div><div class="form-row" style="margin-top:10px"><input class="input" data-field="wins" type="number" value="${fmtNum(t.wins)}" placeholder="Wins"/><input class="input" data-field="losses" type="number" value="${fmtNum(t.losses)}" placeholder="Losses"/><input class="input" data-field="ties" type="number" value="${fmtNum(t.ties)}" placeholder="Ties"/><input class="input" data-field="points_for" type="number" value="${fmtNum(t.points_for)}" placeholder="PF"/></div></div>`).join("")}</div></article>`;
}
function adminScheduleEditor() {
  return `<article class="card"><div class="section-head"><div><div class="kicker">Schedule</div><h2>Edit scores and LIVE status</h2></div></div><div class="editor-list">${state.schedule.slice(0, 80).map(g => `<div class="editor-item" data-game="${escapeHtml(g.id)}"><div class="form-row two"><input class="input" data-field="week" value="${escapeHtml(g.week)}" /><input class="input" data-field="week_number" type="number" value="${fmtNum(g.week_number)}" /></div><div class="form-row"><input class="input" data-field="away_team_name" value="${escapeHtml(g.away_team_name)}" /><input class="input" data-field="home_team_name" value="${escapeHtml(g.home_team_name)}" /><input class="input" data-field="away_score" type="number" value="${g.away_score ?? ""}" placeholder="Away score"/><input class="input" data-field="home_score" type="number" value="${g.home_score ?? ""}" placeholder="Home score"/></div><div class="form-row" style="margin-top:10px"><select class="select" data-field="status">${["scheduled","live","final","postponed","cancelled"].map(s=>`<option value="${s}" ${g.status===s?"selected":""}>${s}</option>`).join("")}</select><label class="pill"><input type="checkbox" data-field="is_live" ${g.is_live ? "checked" : ""}/> LIVE</label><input class="input" data-field="source_sheet" value="${escapeHtml(g.source_sheet || "")}" /><button class="btn primary save-game">Save game</button></div></div>`).join("")}</div></article>`;
}
function adminRankingsEditor() {
  return `<article class="card"><div class="section-head"><div><div class="kicker">Rankings</div><h2>Weekly power rankings</h2></div></div><div class="editor-list">${state.rankings.slice(0, 32).map(r => `<div class="editor-item" data-ranking="${escapeHtml(r.id)}"><div class="form-row"><input class="input" data-field="week" type="number" value="${fmtNum(r.week)}" /><input class="input" data-field="rank" type="number" value="${fmtNum(r.rank)}" /><input class="input" data-field="team_name" value="${escapeHtml(r.team_name)}" /><input class="input" data-field="previous_rank" type="number" value="${r.previous_rank ?? ""}" /></div><div class="form-row" style="margin-top:10px"><input class="input" data-field="note" value="${escapeHtml(r.note || "")}" placeholder="Note"/><button class="btn primary save-ranking">Save ranking</button></div></div>`).join("")}</div></article>`;
}
function adminPublishers() {
  return `<article class="card"><div class="section-head"><div><div class="kicker">Content</div><h2>News, awards, history, and rules</h2></div></div><div class="grid grid-2"><form id="newsForm" class="stack"><input class="input" name="title" placeholder="News title"/><input class="input" name="category" placeholder="Category" value="League"/><textarea class="textarea" name="body" placeholder="News body"></textarea><input class="input" name="image_url" placeholder="Image URL"/><button class="btn good" type="submit">Publish news</button></form><form id="rulesForm" class="stack"><input class="input" name="title" placeholder="Rules title" value="League Rules"/><textarea class="textarea" name="body" placeholder="Rules text">Add your NTFL rules here.</textarea><button class="btn primary" type="submit">Save rules</button></form></div><div class="grid grid-3" style="margin-top:14px"><form id="awardForm" class="stack"><input class="input" name="season" placeholder="Season" value="${SEASON_LABEL}"/><input class="input" name="award_name" placeholder="Award name"/><input class="input" name="winner" placeholder="Winner"/><button class="btn primary" type="submit">Add award</button></form><form id="historyForm" class="stack"><input class="input" name="season" placeholder="Season" value="${SEASON_LABEL}"/><input class="input" name="title" placeholder="History title"/><textarea class="textarea" name="body" placeholder="History note"></textarea><button class="btn primary" type="submit">Add history</button></form><form id="settingsForm" class="stack"><input class="input" name="season_banner" placeholder="Banner title" value="${SEASON_LABEL} Week 1"/><input class="input" name="home_headline" placeholder="Home headline" value="Where the NTFL collides"/><button class="btn primary" type="submit">Save site settings</button></form></div></article>`;
}
function bindAdminActions() {
  document.querySelectorAll(".save-team").forEach(btn => btn.addEventListener("click", async (e) => {
    const row = e.target.closest("[data-team]");
    const original = row.getAttribute("data-team");
    const data = {};
    row.querySelectorAll("[data-field]").forEach(el => data[el.dataset.field] = el.type === "number" ? Number(el.value || 0) : (el.type === "checkbox" ? el.checked : el.value));
    await supabase.from("teams").upsert({
      ...data,
      wins: Number(data.wins || 0), losses: Number(data.losses || 0), ties: Number(data.ties || 0),
      points_for: Number(data.points_for || 0), points_against: Number(data.points_against || 0),
      name: data.name || original
    }, { onConflict: "name" });
    location.reload();
  }));
  document.querySelectorAll(".save-game").forEach(btn => btn.addEventListener("click", async (e) => {
    const row = e.target.closest("[data-game]");
    const id = row.getAttribute("data-game");
    const data = { id };
    row.querySelectorAll("[data-field]").forEach(el => { data[el.dataset.field] = el.type === "checkbox" ? el.checked : (el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value); });
    await supabase.from("schedule_games").upsert(data);
    location.reload();
  }));
  document.querySelectorAll(".save-ranking").forEach(btn => btn.addEventListener("click", async (e) => {
    const row = e.target.closest("[data-ranking]");
    const id = row.getAttribute("data-ranking");
    const data = { id };
    row.querySelectorAll("[data-field]").forEach(el => { data[el.dataset.field] = el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value; });
    await supabase.from("rankings").upsert(data);
    location.reload();
  }));
  const newsForm = document.getElementById("newsForm");
  if (newsForm) newsForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(newsForm);
    await supabase.from("news").insert({ title: fd.get("title"), body: fd.get("body"), category: fd.get("category") || "League", image_url: fd.get("image_url") || "", is_featured: true });
    location.reload();
  };
  const rulesForm = document.getElementById("rulesForm");
  if (rulesForm) rulesForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(rulesForm);
    await supabase.from("site_settings").upsert({ key: "rules", value: { title: fd.get("title"), body: fd.get("body") } });
    location.reload();
  };
  const awardForm = document.getElementById("awardForm");
  if (awardForm) awardForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(awardForm);
    await supabase.from("awards").insert({ season: fd.get("season"), award_name: fd.get("award_name"), winner: fd.get("winner"), note: "", icon: "🏆" });
    location.reload();
  };
  const historyForm = document.getElementById("historyForm");
  if (historyForm) historyForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(historyForm);
    await supabase.from("history_items").insert({ season: fd.get("season"), title: fd.get("title"), body: fd.get("body"), image_url: "" });
    location.reload();
  };
  const settingsForm = document.getElementById("settingsForm");
  if (settingsForm) settingsForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(settingsForm);
    await supabase.from("site_settings").upsert([
      { key: "season_banner", value: { title: fd.get("season_banner"), subtitle: APP_NAME } },
      { key: "home_banner", value: { headline: fd.get("home_headline"), cta: "Commissioner Control Center" } }
    ]);
    location.reload();
  };
}
async function renderAdmin() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) { renderLoginBox("Use your Supabase auth email and password."); return; }
  app.innerHTML = `<section class="section"><div class="panel"><div class="section-head"><div><div class="kicker">Commissioner Dashboard</div><h2>Manage the whole league from Supabase</h2></div><button class="btn" id="logoutBtn">Sign out</button></div><div class="grid grid-4"><div class="stat"><b>${state.teams.length}</b><span class="muted">Teams</span></div><div class="stat"><b>${state.schedule.length}</b><span class="muted">Games</span></div><div class="stat"><b>${state.news.length}</b><span class="muted">News posts</span></div><div class="stat"><b>${state.rankings.length}</b><span class="muted">Rankings</span></div></div></div></section><section class="section">${adminTeamEditor()}</section><section class="section">${adminScheduleEditor()}</section><section class="section">${adminRankingsEditor()}</section><section class="section">${adminPublishers()}</section>`;
  document.getElementById("logoutBtn").onclick = async () => { await supabase.auth.signOut(); location.reload(); };
  bindAdminActions();
}
async function boot() {
  await loadAll();
  navActive();
  const pageMap = { index: renderHome, teams: renderTeams, schedule: renderSchedule, standings: renderStandings, rankings: renderRankings, news: renderNews, awards: renderAwards, history: renderHistory, rules: renderRules, game: renderGame, admin: renderAdmin };
  (pageMap[page] || renderHome)();
}
boot();
