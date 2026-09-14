import os
import json
import argparse
import requests
from pathlib import Path
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
    You are a KYC generation expert. You generate valid ComfyUI JSON workflows for synthetic documents and identity testing.
    You must abide by the following structural facts recalled from your memory palace:
    {memory_context}
    
    You have access to the following workflow paradigms:
    1. Standard ID Document Generation / Editing: SDXL base + ControlNet / LoRA
    2. Face Swap & Liveness: ReActorFaceSwap + CodeFormer
    3. Spoof Artifact Injection: Screen glare, moire pattern, reflection injection
    4. Identity-Preserving Edit & Restaging: Krea-2 Identity Edit (conradlocke/krea2-identity-edit)
       - Uses 'krea2_identity_edit_v1_2.safetensors' with Krea2EditModelPatch (ref_boost: 4.0, fit_mode: 'fit')
       - Uses Krea2EditGroundedEncode with Qwen3-VL text encoder ('qwen3vl_4b_fp8_scaled.safetensors', grounding_px: 768)
       - Uses Krea-2 Turbo UNet ('krea2_turbo_fp8_scaled.safetensors') with 10-step Euler sampler
       - Use this paradigm whenever preserving portrait facial identity across lighting, expression, or scene changes is requested.

    Output ONLY valid JSON representing the ComfyUI nodes (dictionary mapping node IDs to their class_type, inputs, and _meta), with no markdown formatting.
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
        
        # Save copy for inspection and debugging
        try:
            debug_path = Path("../datasets/processed/last_generated_workflow.json")
            debug_path.parent.mkdir(parents=True, exist_ok=True)
            with open(debug_path, "w", encoding="utf-8") as f:
                json.dump(workflow_dict, f, indent=2)
            print(f"Saved workflow to {debug_path}")
        except Exception as e:
            print(f"Could not save debug workflow: {e}")
        
        # Dispatch to ComfyUI
        print("Submitting to ComfyUI...")
        comfy = ComfyUIClient()
        result = comfy.submit_dynamic_workflow(workflow_dict)
        
        # Check result from ComfyUI
        if result and "prompt_id" in result:
            print(f"Successfully queued in ComfyUI! Prompt ID: {result['prompt_id']}")
            print("Storing success memory...")
            m.add(f"Successfully generated workflow for prompt: '{prompt}'", user_id="agent_kyc_expert")
        else:
            print(f"Submission failed or returned no prompt_id. ComfyUI Response: {result}")
            
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
