import asyncio
import redis.asyncio as redis

async def main():
    r = redis.from_url('rediss://default:gQAAAAAAAUrDAAIncDIwMzc0NDZlOTNmYTA0ZjU1YjJiYzE5ZDA0NDVlZTU5N3AyODQ2NzU@large-mule-84675.upstash.io:6379')
    try:
        await r.ping()
        print('✅ Success! Connected to Upstash Redis.')
    except Exception as e:
        print('❌ Connection failed:', e)
    finally:
        await r.aclose()

if __name__ == '__main__':
    asyncio.run(main())
