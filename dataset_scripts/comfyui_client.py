import json
import urllib.request
import urllib.parse
from typing import Dict, Any

class ComfyUIClient:
    def __init__(self, server_address="192.168.4.103:8188"):
        self.server_address = server_address

    def queue_prompt(self, prompt: Dict[str, Any]) -> dict:
        """
        Sends the workflow dictionary to the ComfyUI API queue.
        """
        p = {"prompt": prompt}
        data = json.dumps(p).encode('utf-8')
        req = urllib.request.Request(f"http://{self.server_address}/prompt", data=data)
        
        try:
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as e:
            try:
                error_body = e.read().decode("utf-8")
                print(f"Failed to queue prompt: HTTP Error {e.code}: {e.reason}")
                print(f"ComfyUI Error Details:\n{error_body}")
            except Exception:
                print(f"Failed to queue prompt: {e}")
            return {}
        except Exception as e:
            print(f"Failed to queue prompt: {e}")
            return {}

    def submit_dynamic_workflow(self, workflow_dict: dict):
        """
        Submits an in-memory dictionary workflow directly to the ComfyUI API queue.
        """
        print("Queueing dynamic workflow from memory...")
        result = self.queue_prompt(workflow_dict)
        print(f"Result: {result}")
        return result

    def submit_krea2_identity_edit(self, image_path: str, prompt: str, ref_boost: float = 4.0, grounding_px: int = 768, workflow_path: str = "../comfyui_workflows/krea2_identity_edit.json"):
        """
        Loads the Krea-2 Identity Edit workflow template, injects custom source image,
        instruction prompt, and conditioning parameters, and queues it to ComfyUI.
        """
        try:
            with open(workflow_path, "r", encoding="utf-8") as f:
                workflow = json.load(f)
            
            # Inject inputs
            if "1" in workflow and "inputs" in workflow["1"]:
                workflow["1"]["inputs"]["image"] = image_path
            if "8" in workflow and "inputs" in workflow["8"]:
                workflow["8"]["inputs"]["ref_boost"] = float(ref_boost)
            if "9" in workflow and "inputs" in workflow["9"]:
                workflow["9"]["inputs"]["prompt"] = prompt
                workflow["9"]["inputs"]["grounding_px"] = int(grounding_px)
            if "10" in workflow and "inputs" in workflow["10"]:
                workflow["10"]["inputs"]["grounding_px"] = int(grounding_px)
                
            print(f"Queueing Krea-2 Identity Edit for image='{image_path}' prompt='{prompt}'...")
            return self.queue_prompt(workflow)
        except Exception as e:
            print(f"Failed to submit Krea-2 Identity Edit: {e}")
            return {}

    def run_workflow(self, workflow_path: str):
        """
        Loads a JSON workflow and queues it.
        """
        try:
            with open(workflow_path, "r", encoding="utf-8") as f:
                workflow = json.load(f)
            
            print(f"Queueing workflow from {workflow_path}...")
            result = self.queue_prompt(workflow)
            print(f"Result: {result}")
        except FileNotFoundError:
            print(f"Error: Workflow {workflow_path} not found.")

if __name__ == "__main__":
    client = ComfyUIClient()
    
    print("Testing connection and queueing workflows...")
    # Example execution (will fail if ComfyUI is not running on localhost:8188)
    client.run_workflow("../comfyui_workflows/id_document_editor.json")
    client.run_workflow("../comfyui_workflows/face_swap_liveness.json")
    client.run_workflow("../comfyui_workflows/spoof_artifact_injector.json")
    client.run_workflow("../comfyui_workflows/krea2_identity_edit.json")

