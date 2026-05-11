#!/usr/bin/env python3
"""Direct test of NVIDIA API without server."""
import os
import asyncio
import httpx
from dotenv import load_dotenv

# Load .env file
load_dotenv()

async def test_direct_api():
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        print("❌ NVIDIA_API_KEY not set in environment")
        return
    
    print(f"✓ API key found: {api_key[:15]}...")
    print("\nTesting NVIDIA API directly...\n")
    
    # Test with direct HTTP call
    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    models = [
        "meta/llama-3.1-8b-instruct",
        "mistralai/mistral-nemotron",
        "mistralai/mistral-small-4-119b-2603"
    ]
    
    for model in models:
        print(f"--- Testing {model} ---")
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": "You are a test assistant."},
                {"role": "user", "content": "Say 'TEST_OK' in one word."}
            ],
            "max_tokens": 10,
            "temperature": 0.1
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                print(f"Status: {resp.status_code}")
                
                if resp.status_code == 200:
                    data = resp.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    print(f"✓ SUCCESS: {content[:50]}")
                else:
                    print(f"✗ FAILED: {resp.text[:200]}")
                    
        except Exception as e:
            print(f"✗ ERROR: {type(e).__name__}: {str(e)[:100]}")
        
        print()

if __name__ == "__main__":
    asyncio.run(test_direct_api())
