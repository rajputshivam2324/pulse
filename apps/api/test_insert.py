import os
from dotenv import load_dotenv
load_dotenv()
from supabase import create_client

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

supabase = create_client(url, key)

res = supabase.table("programs").upsert({
    "user_id": "ddbe9d7c-eb2e-455b-a5f4-b3f5ae58d6ed",
    "program_address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "name": "Test",
    "network": "mainnet"
}, on_conflict="user_id,program_address").execute()
print(res)
