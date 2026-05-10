import requests
import jwt
import os
import time
from dotenv import load_dotenv

load_dotenv()
secret = os.environ.get("JWT_SECRET")

from services.supabase import get_supabase
supabase = get_supabase()
prog = supabase.table("programs").select("user_id").eq("program_address", "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr").execute()
if not prog.data:
    print("Program not found")
    exit(1)
user_id = prog.data[0]["user_id"]
user = supabase.table("users").select("wallet_pubkey").eq("id", user_id).execute()
wallet = user.data[0]["wallet_pubkey"]

token = jwt.encode(
    {"wallet": wallet, "exp": int(time.time()) + 3600},
    secret,
    algorithm="HS256"
)

url = "http://localhost:8000/analytics/sync/MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr?program_name=Memo%20Program"
resp = requests.post(url, headers={"Authorization": f"Bearer {token}"})
print(resp.status_code)
print(resp.json())
