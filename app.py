import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from supabase import create_client
from dotenv import load_dotenv
from datetime import date
from typing import List

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Please set SUPABASE_URL and SUPABASE_KEY in .env")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


def calculate_age(birthday_str):
    if not birthday_str:
        return None
    try:
        birth_date = date.fromisoformat(birthday_str)
    except Exception:
        # 如果 birthday 存储格式不同，可在这里扩展解析
        return None
    today = date.today()
    return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))


def find_avatar(player_id: str) -> str:
    """在 static/avatars 中自动匹配 png/jpg/jpeg，返回相对 static 路径（不含 /static 前缀）"""
    avatar_dir = os.path.join("static", "avatars")
    extensions = ["png", "jpg", "jpeg"]
    for ext in extensions:
        fn = f"{player_id}.{ext}"
        if os.path.exists(os.path.join(avatar_dir, fn)):
            return f"avatars/{fn}"
    # fallback default
    # 支持 default.png 与 default.jpg，优先 png
    if os.path.exists(os.path.join(avatar_dir, "default.png")):
        return "avatars/default.png"
    if os.path.exists(os.path.join(avatar_dir, "default.jpg")):
        return "avatars/default.jpg"
    return "avatars/default.png"


def build_match_info(row: dict) -> str:
    """按照规则合成 match_info 文本并附加图标信息"""
    venue = (row.get("venue") or "").lower()
    team_name = row.get("team_name") or ""
    oppo_name = row.get("oppo_name") or ""
    team_score = row.get("team_score")
    oppo_score = row.get("oppo_score")

    # 将 None 转为空字符串或 0
    ts = "" if team_score is None else str(team_score)
    oscore = "" if oppo_score is None else str(oppo_score)

    # 主场显示 team_name team_score - oppo_score oppo_name
    if "主" in venue or "home" in venue:
        base = f"{team_name} {ts} - {oscore} {oppo_name}"
    elif "客" in venue or "away" in venue:
        # 如果是客场，我们按你的要求“反过来”
        base = f"{oppo_name} {oscore} - {ts} {team_name}"
    else:
        # 中立或未知
        base = f"{team_name} {ts} - {oscore} {oppo_name}"

    extras = []
    try:
        goals = int(row.get("goals") or 0)
        yellow = int(row.get("yellow_cards") or 0)
        red = int(row.get("red_cards") or 0)
    except Exception:
        goals = yellow = red = 0

    if goals > 0:
        extras.append(f"⚽{goals}")
    if yellow > 0:
        extras.append(f"🟨{yellow}")
    if red > 0:
        extras.append(f"🔴{red}")

    if extras:
        base = base + "  " + " ".join(extras)
    return base


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    # 从 Supabase 取 player_info（只取基础列以减少流量）
    # 你可以按需修改 select 列的具体字段
    try:
        res = supabase.table("player_with_seasons").select("*").execute()
        players = res.data
    except Exception as e:
        return HTMLResponse(f"<h1>Database error: {e}</h1>", status_code=500)

    # 为每个 player 补充 age、club_display（若存在 season info）和 avatar_url
    # 注意：players 表中如无季信息时 club_country/club_name 可能为空
    for p in players:
        p["age"] = calculate_age(p.get("birthday"))
        # 若 player_info 里没有 club_country / club_name，就先留空（index 页面展示以 p.get(...) 为准）
        p["avatar_url"] = find_avatar(p.get("player_id"))
        if p.get("seasons") and isinstance(p["seasons"], list):
            # 过滤掉 None 元素，确保元素都有 season 字段
            valid_seasons = [s for s in p["seasons"] if s and "season" in s]
            if valid_seasons:
            # 假设 season 格式是 "YYYY-YY"，直接字符串倒序即可
                latest_season = sorted(valid_seasons, key=lambda s: s["season"], reverse=True)[0]
                p["club_country"] = latest_season.get("club_country", "")
                p["club_name"] = latest_season.get("club_name", "")
                p["team"] = latest_season.get("club_team", "")
                p["competition_category"] = latest_season.get("league_category", "")
            else:
                # 没有赛季数据，填空
                p["club_country"] = ""
                p["club_name"] = ""
                p["team"] = ""
                p["competition_category"] = ""

    # 为筛选下拉生成 options（country/gender），这里从 player_info 中提取
    countries = sorted({p.get("club_country") for p in players if p.get("club_country")})
    genders = sorted({p.get("gender") for p in players if p.get("gender")})

    return templates.TemplateResponse("index.html", {
        "request": request,
        "players": players,
        "countries": countries,
        "genders": genders
    })


@app.get("/player/{player_id}", response_class=HTMLResponse)
async def player_detail_page(request: Request, player_id: str):
    # 返回用于详情页的模板（前端通过 AJAX 拉取数据）
    return templates.TemplateResponse("player_detail.html", {
        "request": request,
        "player_id": player_id
    })


@app.get("/api/player/{player_id}/info")
async def api_player_info(player_id: str):
    # 查询 player_info
    try:
        res = supabase.table("player_info").select("*").eq("player_id", player_id).execute()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    if not res.data:
        return JSONResponse({"error": "Player not found"}, status_code=404)
    player = res.data[0]
    player["age"] = calculate_age(player.get("birthday"))
    player["avatar_url"] = find_avatar(player_id)
    return player


@app.get("/api/player/{player_id}/seasons")
async def api_player_seasons(player_id: str):
    # 查询 player_season_info，按 season 排序（降序）
    try:
        res = supabase.table("player_with_seasons").select("*").eq("player_id", player_id).execute()
        player = res.data
    except Exception as e:
        return HTMLResponse(f"<h1>Database error: {e}</h1>", status_code=500)

    player_data = player[0]
    seasons = player_data.get("seasons") or []
    if not isinstance(seasons, list):
        seasons = []
    valid_seasons = [s for s in seasons if s and isinstance(s, dict) and "season" in s]
    valid_seasons = sorted(valid_seasons, key=lambda s: s["season"], reverse=True)
    return valid_seasons


@app.get("/api/player/{player_id}/matches")
async def api_player_matches(player_id: str, season: str = None, game_type: str = None, team_name: str = None):
    # 先查该球员所有的 player_season_id
    try:
        res = supabase.table("player_season_info").select("player_season_id,season,club_name,club_country").eq("player_id", player_id).execute()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    season_rows = res.data or []
    season_ids = [r["player_season_id"] for r in season_rows]

    if not season_ids:
        return {"matches": [], "seasons": [], "teams": []}

    # 根据可选筛选参数，查询 player_match_info（使用 .in 方法限定 player_season_id）
    query = supabase.table("player_match_info").select("*").in_("player_season_id", season_ids)
    # 这里 supabase-py query builder 没有像 sqlalchemy 那样链式判断方便，直接用 execute 之后再筛选
    try:
        res2 = query.execute()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    matches = res2.data or []

    # 将 matches 先 enrich：加 season 方便前端筛选（用 player_season_id -> season map）
    season_map = {r["player_season_id"]: r.get("season") for r in season_rows}
    team_set = set()
    season_set = set()
    game_type_set = set()

    enriched = []
    for m in matches:
        m_season = season_map.get(m.get("player_season_id"))
        m["season"] = m_season
        # 合成 match_info
        m["match_info"] = build_match_info(m)
        # collect sets
        if m.get("team_name"):
            team_set.add(m.get("team_name"))
        if m_season:
            season_set.add(m_season)
        if m.get("game_type"):
            game_type_set.add(m.get("game_type"))
        enriched.append(m)

    # 在后端也支持一些基本过滤（避免前端加载太多不必要数据）
    if season:
        enriched = [m for m in enriched if m.get("season") == season]
    if game_type:
        enriched = [m for m in enriched if (m.get("game_type") or "") == game_type]
    if team_name:
        enriched = [m for m in enriched if (m.get("team_name") or "") == team_name]

    # 按 date 降序（如 date 格式为 ISO）
    try:
        enriched.sort(key=lambda x: x.get("date") or "", reverse=True)
    except Exception:
        pass

    return {
        "matches": enriched,
        "seasons": sorted(list(season_set), reverse=True),
        "teams": sorted(list(team_set)),
        "game_types": sorted(list(game_type_set))
    }
