import asyncio
import os
import redis.asyncio as redis
from dotenv import load_dotenv

load_dotenv()

async def main():
    redis_url = os.getenv('UPSTASH_REDIS_URL', 'redis://localhost:6379')
    r = redis.from_url(redis_url)
    try:
        await r.ping()
        print('✅ Success! Connected to Redis.')
    except Exception as e:
        print('❌ Connection failed:', e)
    finally:
        await r.aclose()

if __name__ == '__main__':
    asyncio.run(main())
