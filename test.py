import os
from supabase import create_client, Client

url: str = "https://orktukpenynffkehchhf.supabase.co"
key: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ya3R1a3BlbnluZmZrZWhjaGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMTQ1NzMsImV4cCI6MjA2OTY5MDU3M30.FljlN4Chc1nepN7ybcQIsYQhvh44ZcclKvVcQUG9Al8"
supabase: Client = create_client(url, key)

response = supabase.table("player_with_seasons").select("*").execute()
players = response.data
print(f"players: {players}")