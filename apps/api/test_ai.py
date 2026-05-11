#!/usr/bin/env python3
"""Test script to check NVIDIA AI API directly."""

import os
import asyncio
import sys

# Load env
from dotenv import load_dotenv
load_dotenv()

async def test_nvidia_api():
    """Test if NVIDIA API is responding."""
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        print("❌ ERROR: NVIDIA_API_KEY not set")
        return False
    
    print(f"✓ API key found: {api_key[:10]}...")
    
    # Test models
    models_to_test = [
        "meta/llama-3.1-8b-instruct",
        "mistralai/mistral-nemotron",
        "mistralai/mistral-small-4-119b-2603",
    ]
    
    for model_name in models_to_test:
        print(f"\n--- Testing {model_name} ---")
        try:
            from langchain_nvidia_ai_endpoints import ChatNVIDIA
            from langchain_core.messages import HumanMessage, SystemMessage
            
            model = ChatNVIDIA(
                model=model_name,
                api_key=api_key,
                temperature=0.6,
                max_completion_tokens=100,
            )
            
            messages = [
                SystemMessage(content="You are a test assistant. Reply with 'OK' only."),
                HumanMessage(content="Say OK")
            ]
            
            print(f"Sending request to {model_name}...")
            response = await asyncio.wait_for(
                model.ainvoke(messages),
                timeout=30
            )
            
            print(f"✓ {model_name}: SUCCESS")
            print(f"  Response: {response.content[:50]}")
            
        except Exception as e:
            print(f"✗ {model_name}: FAILED")
            print(f"  Error: {type(e).__name__}: {str(e)[:100]}")
    
    return True

if __name__ == "__main__":
    print("Testing NVIDIA AI API connectivity...\n")
    result = asyncio.run(test_nvidia_api())
    sys.exit(0 if result else 1)
