from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from supabase import create_client
from supabase._sync.client import ClientOptions
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# 配置Supabase
supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

@app.get("/")
async def read_players(request: Request):
    # 从Supabase获取数据
    response = supabase.table("player_with_seasons").select("*").execute()
    players = response.data
    print(f"players: {players}")
    
    # 计算年龄（增强数据展示）
    for player in players:
        if player['birthday']:
            birth_year = int(player['birthday'][:4])
            player['age'] = 2025 - birth_year
    
    return templates.TemplateResponse("index.html", {
        "request": request,
        "players": players
    })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)