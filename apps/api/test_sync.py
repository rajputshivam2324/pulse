import asyncio
from dotenv import load_dotenv
load_dotenv()

from services.supabase import get_supabase
from routers.analytics import sync_program
from starlette.requests import Request

async def main():
    try:
        # Mock Request for slowapi
        scope = {
            "type": "http",
            "method": "POST",
            "path": "/analytics/sync/MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
            "client": ("127.0.0.1", 8000),
            "headers": [(b"host", b"localhost")],
        }
        mock_request = Request(scope)

        supabase = get_supabase()
        prog = supabase.table("programs").select("user_id").eq("program_address", "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr").execute()
        if prog.data:
            user_id = prog.data[0]["user_id"]
            user = supabase.table("users").select("wallet_pubkey").eq("id", user_id).execute()
            wallet = user.data[0]["wallet_pubkey"]
            res = await sync_program(
                request=mock_request,
                address="MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
                wallet=wallet,
                program_name="Memo Program"
            )
            print("Success:", res)
        else:
            print("Program not found")
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
