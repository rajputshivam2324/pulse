import os
import asyncio
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("apps/api/.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(url, key)

res = supabase.table("programs").select("*").execute()
print("Programs:", res.data)

res = supabase.table("users").select("*").execute()
print("Users:", res.data)
