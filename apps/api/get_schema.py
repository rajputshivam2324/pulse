import os
from dotenv import load_dotenv
load_dotenv()
from supabase import create_client

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

supabase = create_client(url, key)

res = supabase.table("programs").select("*").execute()
if res.data:
    print(res.data)

