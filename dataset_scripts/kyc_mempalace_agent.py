import os
import json
import argparse
import requests
from mem0 import Memory
from comfyui_client import ComfyUIClient

# Spark AI Agent Config for mem0ai
config = {
    "llm": {
        "provider": "openai",
        "config": {
            "model": "qwen-abliterated",
            "api_key": "local_spark_key",
            "openai_base_url": "http://127.0.0.1:8000/v1"
        }
    },
    "embedder": {
        "provider": "huggingface",
        "config": {
            "model": "BAAI/bge-small-en-v1.5"
        }
    },
    "vector_store": {
        "provider": "chroma",
        "config": {
            "collection_name": "kyc_memory",
            "path": "../datasets/mempalace_db"
        }
    }
}

SPARK_CHAT_URL = "http://127.0.0.1:8000/v1/chat/completions"

def run_agent(prompt: str):
    print(f"Agent received prompt: {prompt}")
    
    try:
        m = Memory.from_config(config)
    except Exception as e:
        print(f"Failed to initialize Memory Palace: {e}")
        return
        
    print("Recalling relevant rules from Memory Palace...")
    try:
        results = m.search(prompt, filters={"user_id": "agent_kyc_expert"})
        memory_context = str(results) if results else "No specific structural rules recalled."
    except Exception as e:
        print(f"Memory retrieval failed: {e}")
        memory_context = "No specific structural rules recalled."
        
    print(f"Recalled Context:\n{memory_context}\n")
    
    # System prompt forces a JSON output matching ComfyUI format
    system_prompt = f"""
    You are a KYC generation expert. You generate valid ComfyUI JSON workflows for synthetic documents.
    You must abide by the following structural facts recalled from your memory palace:
    {memory_context}
    
    Output ONLY valid JSON representing the ComfyUI nodes, with no markdown formatting.
    """
    
    print("Generating ComfyUI workflow via Spark AI Agent...")
    try:
        response = requests.post(
            SPARK_CHAT_URL,
            json={
                "model": "qwen-abliterated",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.2
            },
            headers={"Authorization": f"Bearer {os.getenv('SPARK_API_KEY', 'local_spark_key')}"}
        )
        response.raise_for_status()
        
        reply = response.json()["choices"][0]["message"]["content"]
        
        # Clean potential markdown from output
        reply = reply.strip()
        if reply.startswith("```json"):
            reply = reply[7:]
        if reply.endswith("```"):
            reply = reply[:-3]
            
        workflow_dict = json.loads(reply)
        print("Successfully generated valid ComfyUI workflow.")
        
        # Dispatch to ComfyUI
        print("Submitting to ComfyUI...")
        comfy = ComfyUIClient()
        result = comfy.submit_dynamic_workflow(workflow_dict)
        
        # Optional: Save success back to memory
        if "prompt_id" in result or "error" not in result:
            print("Successfully submitted! Storing success memory...")
            m.add(f"Successfully generated workflow for prompt: '{prompt}'", user_id="agent_kyc_expert")
        else:
            print(f"Submission returned: {result}")
            
    except json.JSONDecodeError:
        print("Failed to parse the Spark AI response as valid JSON.")
        print(f"Raw Output: {reply}")
    except Exception as e:
        print(f"Error during agent generation: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Stateful KYC Agent")
    parser.add_argument("prompt", type=str, help="The instruction for the ComfyUI generation")
    args = parser.parse_args()
    run_agent(args.prompt)
