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
    ["状态", data.status || "-"]
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
                    <td>${stats}</td>
                    <td>
                      <button onclick='openMatchForm(${JSON.stringify(m)})'>编辑</button>
                    </td>`;
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

// 在文件顶部确保有一个全局 editingMatchId（用于编辑模式）
let editingMatchId = null; // 当编辑时，openMatchForm(...) 应设置它为对应 player_match_id

function openMatchForm(matchData = null) {
    const modal = document.getElementById("matchFormModal");
    const form = document.getElementById("matchForm");
    const deleteBtn = document.getElementById("deleteMatchBtn");

    form.reset(); // 清空表单

    if (matchData) {
        editingMatchId = matchData.player_match_id;
        document.getElementById("matchFormTitle").innerText = "编辑比赛记录";
        Object.keys(matchData).forEach(key => {
            if (form.elements[key] !== undefined) {
                form.elements[key].value = matchData[key] ?? "";
            }
        });

        setupLineupToggle();

        deleteBtn.style.display = "inline-block";

        deleteBtn.onclick = async () => {
            if (confirm("确认删除该比赛记录吗？此操作不可撤销！")) {
                try {
                    const playerId = (typeof PLAYER_ID !== "undefined") ? PLAYER_ID : (window.CURRENT_PLAYER_ID || null);
                    if (!playerId) {
                        alert("未检测到 player id，无法删除。");
                        return;
                    }
                    const resp = await fetch(`/api/player/${encodeURIComponent(playerId)}/match/delete/${encodeURIComponent(editingMatchId)}`, {
                        method: "DELETE",
                    });
                    const result = await resp.json();
                    if (result.success) {
                        alert("删除成功");
                        closeMatchForm();
                        editingMatchId = null;
                        await loadMatches(); // 重新加载比赛列表
                    } else {
                        alert("删除失败: " + (result.detail || JSON.stringify(result)));
                    }
                } catch (err) {
                    console.error(err);
                    alert("删除请求异常，请查看控制台。");
                }
            }
        };
    } else {
        editingMatchId = null;
        setupLineupToggle();
        document.getElementById("matchFormTitle").innerText = "新增比赛记录";
        deleteBtn.style.display = "none";
        deleteBtn.onclick = null;
    }
    console.log("openMatchForm editingMatchId =", editingMatchId);
    modal.style.display = "block";
}


function closeMatchForm() {
    document.getElementById("matchFormModal").style.display = "none";
}

async function saveMatchForm(e) {
  e.preventDefault();
  const form = document.getElementById("matchForm");
  const fd = new FormData(form);
  const formData = Object.fromEntries(fd.entries());

  // 处理 boolean / checkbox / select 返回值
  if (formData.lineup === undefined) {
    formData.lineup = false;
  } else {
    // 支持 checkbox("on") 或 select "true"/"false"
    formData.lineup = String(formData.lineup) === "on" || String(formData.lineup) === "true";
  }

  // 把空字符串的数值字段转成 undefined，带数字的转成 int
  const intFields = [
    "team_score","oppo_score","pen_team_score","pen_oppo_score",
    "full_length","minutes_played","goals","yellow_cards","red_cards"
  ];
  intFields.forEach(k => {
    if (formData[k] === undefined || formData[k] === "") {
      delete formData[k];
    } else {
      const v = parseInt(formData[k], 10);
      formData[k] = Number.isNaN(v) ? null : v;
    }
  });

  // player id 从全局 PLAYER_ID（模板注入）获取；优雅回退到 window.CURRENT_PLAYER_ID（若你用了这个名）
  const playerId = (typeof PLAYER_ID !== "undefined") ? PLAYER_ID : (window.CURRENT_PLAYER_ID || null);
  if (!playerId) {
    alert("未检测到 player id，无法保存，请检查模板是否注入 PLAYER_ID。");
    return;
  }

  // 如果是新增（没有隐藏的 player_match_id），生成 player_match_id；编辑时保留原 id（editingMatchId）
  if (!editingMatchId && (!formData.player_match_id || formData.player_match_id === "")) {
    // 需要 season 与 date 来生成 id
    if (!formData.season) { alert("请填写赛季"); return; }
    if (!formData.date) { alert("请填写比赛日期"); return; }

    // date 预期格式 "YYYY-MM-DD"；生成 YYYYMMDD 形式
    const dateStr = formData.date;
    const ymd = dateStr.replace(/-/g, "");
    formData.player_match_id = `${playerId}_${ymd}`;
  } else if (editingMatchId) {
    // 编辑模式：确保 formData.player_match_id = editingMatchId（防止前端被改）
    formData.player_match_id = editingMatchId;
  }

  // player_season_id: 如果前端没有传就生成
  if (!formData.player_season_id || formData.player_season_id === "") {
    if (!formData.season) { alert("请填写赛季"); return; }
    formData.player_season_id = `${playerId}_${formData.season}`;
  }

  // 发送到后端：新增或更新
  const url = editingMatchId
    ? `/api/player/${encodeURIComponent(playerId)}/match/update/${encodeURIComponent(editingMatchId)}`
    : `/api/player/${encodeURIComponent(playerId)}/match/add`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData)
    });
    const result = await resp.json();
    if (result.success) {
      // 成功：关闭弹窗、清空 editing 状态、重新加载比赛数据
      closeMatchForm();
      editingMatchId = null;
      await loadMatches(); // 你原来的函数用来刷新比赛表格
    } else {
      alert("保存失败: " + (result.error || JSON.stringify(result)));
    }
  } catch (err) {
    console.error(err);
    alert("保存时出现异常，请查看控制台： " + err);
  }
}

async function deleteMatch(playerId, matchId) {
  if (!confirm("确定删除该比赛记录吗？此操作不可恢复。")) return;

  try {
    const resp = await fetch(`/api/player/${encodeURIComponent(playerId)}/match/delete/${encodeURIComponent(matchId)}`, {
      method: "DELETE",
    });
    const result = await resp.json();
    if (result.success) {
      alert("删除成功！");
      await loadMatches();  // 重新加载比赛列表
    } else {
      alert("删除失败: " + (result.detail || JSON.stringify(result)));
    }
  } catch (err) {
    console.error(err);
    alert("删除请求异常，请查看控制台。");
  }
}

function setupLineupToggle() {
  const lineupSelect = document.getElementById("lineupSelect");
  const lineupDetails = document.getElementById("lineupDetails");

  function toggleLineupFields() {
    if (lineupSelect.value === "true") {
      lineupDetails.style.display = "";  // 显示
    } else {
      lineupDetails.style.display = "none"; // 隐藏
    }
  }

  lineupSelect.addEventListener("change", toggleLineupFields);

  // 页面打开或表单打开时调用，保证状态正确
  toggleLineupFields();
}
