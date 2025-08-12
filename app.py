import os
from fastapi import FastAPI, Request, HTTPException, Body
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from supabase import create_client
from dotenv import load_dotenv
from datetime import date, datetime
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
        return None
    today = date.today()
    return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))


def find_avatar(player_id: str) -> str:
    """在 static/avatars 中自动匹配 png/jpg/jpeg"""
    avatar_dir = os.path.join("static", "avatars")
    extensions = ["png", "jpg", "jpeg"]
    for ext in extensions:
        fn = f"{player_id}.{ext}"
        if os.path.exists(os.path.join(avatar_dir, fn)):
            return f"avatars/{fn}"
    # fallback default
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

    ts = "" if team_score is None else str(team_score)
    oscore = "" if oppo_score is None else str(oppo_score)

    if "主场" in venue:
        base = f"<strong>{team_name}</strong> {ts} - {oscore} {oppo_name}"
    elif "客场" in venue:
        base = f"{oppo_name} {oscore} - {ts} <strong>{team_name}</strong>"
    else:
        base = f"<strong>{team_name}</strong> {ts} - {oscore} {oppo_name}"

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
    try:
        res = supabase.table("player_with_seasons").select("*").execute()
        players = res.data
    except Exception as e:
        return HTMLResponse(f"<h1>Database error: {e}</h1>", status_code=500)

    for p in players:
        p["age"] = calculate_age(p.get("birthday"))
        # 若 player_info 里没有 club_country / club_name，就先留空（index 页面展示以 p.get(...) 为准）
        p["avatar_url"] = find_avatar(p.get("player_id"))
        if p.get("seasons") and isinstance(p["seasons"], list):
            # 过滤掉 None 元素，确保元素都有 season 字段
            valid_seasons = [s for s in p["seasons"] if s and "season" in s]
            if valid_seasons:
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

    countries = sorted({p.get("club_country") for p in players if p.get("club_country")})

    return templates.TemplateResponse("index.html", {
        "request": request,
        "players": players,
        "countries": countries
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

from fastapi import HTTPException, Path, Body
from pydantic import BaseModel, Field, validator
from typing import Optional

# 定义请求体模型，用于校验和自动文档
class MatchInfo(BaseModel):
    player_match_id: Optional[str] = None
    player_season_id: str
    date: str  # 简化示例用str，格式 "YYYY-MM-DD"
    game_type: Optional[str] = None
    game_name: Optional[str] = None
    match_id: Optional[str] = None
    venue: Optional[str] = None
    team_name: Optional[str] = None
    team_score: Optional[int] = None
    oppo_name: Optional[str] = None
    oppo_score: Optional[int] = None
    pen_team_score: Optional[int] = None
    pen_oppo_score: Optional[int] = None
    full_length: Optional[int] = None
    lineup: Optional[str] = None
    role: Optional[str] = None
    minutes_played: Optional[int] = None
    goals: Optional[int] = None
    yellow_cards: Optional[int] = None
    red_cards: Optional[int] = None

    @validator("date")
    def date_format_check(cls, v):
        import re
        if not re.match(r"\d{4}-\d{2}-\d{2}", v):
            raise ValueError("日期格式必须是 YYYY-MM-DD")
        return v

def generate_unique_match_id(player_id: str, date_str: str) -> str:
    base_id = f"{player_id}_{date_str.replace('-', '')}"
    candidate_id = base_id
    suffix = 0
    while True:
        res = supabase.table("player_match_info").select("player_match_id").eq("player_match_id", candidate_id).execute()
        if not res.data:
            return candidate_id
        suffix += 1
        candidate_id = f"{base_id}_{suffix}"


@app.post("/api/player/{player_id}/match/add")
async def add_player_match(player_id: str, match: MatchInfo):
    # 校验必须字段
    if not match.date:
        raise HTTPException(status_code=400, detail="比赛日期不能为空")
    if not match.player_season_id:
        raise HTTPException(status_code=400, detail="球员赛季ID不能为空")

    # 自动生成唯一player_match_id
    unique_match_id = generate_unique_match_id(player_id, match.date)
    match.player_match_id = unique_match_id

    # 确保player_season_id包含player_id
    if not match.player_season_id.startswith(player_id):
        raise HTTPException(status_code=400, detail="player_season_id格式错误，应包含player_id")

    try:
        supabase.table("player_match_info").insert(match.dict(exclude_none=True)).execute()
        return {"success": True, "player_match_id": unique_match_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据库插入失败: {e}")


@app.post("/api/player/{player_id}/match/update/{match_id}")
async def update_player_match(
    player_id: str = Path(...),
    match_id: str = Path(...),
    match: MatchInfo = Body(...),
):
    if match_id != match.player_match_id:
        raise HTTPException(status_code=400, detail="路径match_id与请求体player_match_id不匹配")

    try:
        res = supabase.table("player_match_info").select("*").eq("player_match_id", match_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询原记录失败: {e}")

    if not res.data:
        raise HTTPException(status_code=404, detail="未找到要更新的比赛记录")
    
    existing = res.data[0]
    old_date = existing.get("date")
    new_date = match.date if getattr(match, "date", None) is not None else old_date

    new_player_match_id = match_id
    if new_date and new_date != old_date:
        new_player_match_id = generate_unique_match_id(player_id, new_date)
    
    update_data = match.dict(exclude_none=True)
    update_data["player_match_id"] = new_player_match_id

    try:
        res = supabase.table("player_match_info").update(update_data).eq("player_match_id", match_id).execute()
        if res.count == 0:
            raise HTTPException(status_code=404, detail="未找到指定的比赛记录")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据库更新失败: {e}")

@app.delete("/api/player/{player_id}/match/delete/{match_id}")
async def delete_player_match(player_id: str, match_id: str):
    try:
        res = supabase.table("player_match_info").delete().eq("player_match_id", match_id).execute()
        if res.count == 0:
            raise HTTPException(status_code=404, detail="未找到指定的比赛记录")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据库删除失败: {e}")

@app.get("/api/player/{player_id}/match/{match_id}")
async def get_player_match(player_id: str, match_id: str):
    try:
        res = supabase.table("player_match_info").select("*").eq("player_match_id", match_id).execute()
        if not res.data or len(res.data) == 0:
            raise HTTPException(status_code=404, detail="未找到指定的比赛记录")
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据库查询失败: {e}")

from fastapi import HTTPException, Path
