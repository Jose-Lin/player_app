// detail.js: 加载 player info, seasons, matches，渲染并实现筛选

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(`HTTP ${r.status} ${r.statusText}`);
  }
  return r.json();
}

async function loadBasicInfo() {
  const data = await fetchJSON(`/api/player/${PLAYER_ID}/info`);
  document.getElementById("playerName").innerText = data.name || PLAYER_ID;
  document.getElementById("avatar").src = `/static/${data.avatar_url}`;

  const table = document.getElementById("basicInfoTable");
  table.innerHTML = "";
  const fields = [
    ["姓名", data.name || "-"],
    ["中文名", data.c_name || "-"],
    ["生日", data.birthday || "-"],
    ["年龄", data.age || "-"],
    ["国籍", data.nationality || "-"],
    ["位置", data.position || "-"],
    ["状态", data.status || "-"],
    ["性别", data.gender || "-"]
  ];
  for (const [k,v] of fields) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td style="font-weight:600;width:120px">${k}</td><td>${v}</td>`;
    table.appendChild(tr);
  }
}

async function loadSeasons() {
  const seasons = await fetchJSON(`/api/player/${PLAYER_ID}/seasons`);
  const tbody = document.querySelector("#seasonsTable tbody");
  tbody.innerHTML = "";
  seasons.forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${s.season || '-'}</td>
                    <td>${s.club_country || '-'}</td>
                    <td>${s.club_name || '-'}</td>
                    <td>${s.club_team || '-'}</td>
                    <td>${s.league_category || '-'}</td>
                    <td>${s.league_name || '-'}</td>`;
    tbody.appendChild(tr);
  });
  return seasons;
}

let matchesCache = []; // 存储当前拉取到的 matches（enriched）
let currentSortDateDesc = true;

async function loadMatches(filters = {}) {
  // 为后端过滤提供参数（season, game_type, team_name）
  let params = new URLSearchParams();
  if (filters.season) params.append("season", filters.season);
  if (filters.game_type) params.append("game_type", filters.game_type);
  if (filters.team_name) params.append("team_name", filters.team_name);

  const url = `/api/player/${PLAYER_ID}/matches?${params.toString()}`;
  const payload = await fetchJSON(url);
  matchesCache = payload.matches || [];

  // 填充下拉（只填一次）
  populateMatchFilters(payload);

  renderMatches(matchesCache);
}

function populateMatchFilters(payload) {
  // seasons, teams, game_types
  const sSel = document.getElementById("filterSeason");
  const tSel = document.getElementById("filterTeam");
  const gSel = document.getElementById("filterGameType");

  if (sSel.options.length <= 1) {
    (payload.seasons || []).forEach(s => {
      const o = document.createElement("option"); o.value = s; o.text = s; sSel.appendChild(o);
    });
  }
  if (tSel.options.length <= 1) {
    (payload.teams || []).forEach(t => {
      const o = document.createElement("option"); o.value = t; o.text = t; tSel.appendChild(o);
    });
  }
  if (gSel.options.length <= 1) {
    (payload.game_types || []).forEach(g => {
      const o = document.createElement("option"); o.value = g; o.text = g; gSel.appendChild(o);
    });
  }
}

function renderMatches(list) {
  const tbody = document.querySelector("#matchesTable tbody");
  tbody.innerHTML = "";
  list.forEach(m => {
    const tr = document.createElement("tr");
    const lineup = m.lineup ? (m.role || "首发/替补") : "未出场";
    const minutes = m.minutes_played !== null && m.minutes_played !== undefined ? m.minutes_played : "-";
    const stats = `${m.goals || 0}/${m.yellow_cards || 0}/${m.red_cards || 0}`;
    const d = m.date || "-";
    tr.innerHTML = `<td>${m.season || '-'}</td>
                    <td>${d}</td>
                    <td>${m.game_name || '-'}</td>
                    <td>${m.match_info || '-'}</td>
                    <td>${lineup}</td>
                    <td>${minutes}</td>
                    <td>${stats}</td>`;
    tbody.appendChild(tr);
  });
}

// 本地多条件筛选（在已有 matchesCache 基础上）
function applyLocalFilters() {
  const season = document.getElementById("filterSeason").value;
  const gameType = document.getElementById("filterGameType").value;
  const team = document.getElementById("filterTeam").value;
  const q = document.getElementById("matchSearch").value.trim().toLowerCase();

  let filtered = matchesCache.slice();
  if (season && season !== "all") filtered = filtered.filter(m => m.season === season);
  if (gameType && gameType !== "all") filtered = filtered.filter(m => (m.game_type || "") === gameType);
  if (team && team !== "all") filtered = filtered.filter(m => (m.team_name || "") === team);
  if (q) {
    filtered = filtered.filter(m => {
      const t = (m.game_name || "").toLowerCase();
      const mi = (m.match_info || "").toLowerCase();
      return t.includes(q) || mi.includes(q);
    });
  }
  renderMatches(filtered);
}

function attachEventHandlers() {
  document.getElementById("filterSeason").addEventListener("change", () => loadMatches({season: document.getElementById("filterSeason").value === "all" ? null : document.getElementById("filterSeason").value}));
  document.getElementById("filterGameType").addEventListener("change", applyLocalFilters);
  document.getElementById("filterTeam").addEventListener("change", () => loadMatches({team_name: document.getElementById("filterTeam").value === "all" ? null : document.getElementById("filterTeam").value}));
  document.getElementById("matchSearch").addEventListener("input", applyLocalFilters);
  document.getElementById("refreshBtn").addEventListener("click", () => loadMatches({}));
}

function sortMatchesByDate() {
  // 尝试将当前渲染的 matches 按 date 排序（切换 asc/desc）
  currentSortDateDesc = !currentSortDateDesc;
  const arranged = matchesCache.slice().sort((a,b) => {
    const da = a.date || "";
    const db = b.date || "";
    if (da === db) return 0;
    if (currentSortDateDesc) return da < db ? 1 : -1;
    return da < db ? -1 : 1;
  });
  renderMatches(arranged);
}

// init
(async function init() {
  try {
    await loadBasicInfo();
    await loadSeasons();
    await loadMatches(); // 初次加载，后端会返回所有 matches + seasons + teams info
    attachEventHandlers();
  } catch (e) {
    console.error(e);
    alert("加载数据失败，请检查后端或网络控制台错误信息。");
  }
})();
