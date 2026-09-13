import os
import glob
import json
import requests
from pathlib import Path

UNET_ENDPOINT = "http://localhost:8888/v1/segment"
PROCESSED_DIR = Path("../datasets/processed")
FACTS_OUTPUT = PROCESSED_DIR / "kyc_facts.jsonl"

def extract_metadata():
    print("Starting metadata extraction via U-Net...")
    
    image_paths = []
    # Collect images from the processed dataset folders
    for category in ["id_cards", "selfies", "spoofing_samples"]:
        category_dir = PROCESSED_DIR / category
        if category_dir.exists():
            for ext in ('*.jpg', '*.png'):
                image_paths.extend(glob.glob(str(category_dir / ext)))
    
    if not image_paths:
        print(f"No images found in {PROCESSED_DIR}. Run preprocess_for_comfyui.py first.")
        return
        
    facts_extracted = 0
    with open(FACTS_OUTPUT, "w", encoding="utf-8") as f_out:
        for img_path in image_paths:
            abs_path = str(Path(img_path).absolute())
            try:
                # Send to U-Net dense segmentation endpoint
                response = requests.post(
                    UNET_ENDPOINT, 
                    json={"image_path": abs_path},
                    timeout=5
                )
                
                if response.status_code == 200:
                    data = response.json().get("segmentation_data", {})
                    
                    # Convert dense structural data into natural language facts for Memory Palace
                    if "mrz_block" in data:
                        loc = data["mrz_block"].get("location", "unknown")
                        fact = f"Structural Rule for {Path(img_path).name}: The MRZ block is located at {loc}."
                        f_out.write(json.dumps({"fact": fact, "source_image": abs_path}) + "\n")
                        facts_extracted += 1
                        
                    if "face_bbox" in data:
                        fact = f"Structural Rule for {Path(img_path).name}: Contains a portrait at coordinates {data['face_bbox']}."
                        f_out.write(json.dumps({"fact": fact, "source_image": abs_path}) + "\n")
                        facts_extracted += 1
                        
                else:
                    print(f"Failed to segment {abs_path}: HTTP {response.status_code}")
            except requests.exceptions.ConnectionError:
                print(f"Error: U-Net endpoint not running on {UNET_ENDPOINT}")
                break
            except Exception as e:
                print(f"Error processing {abs_path}: {e}")
                
    print(f"Extraction complete! Wrote {facts_extracted} facts to {FACTS_OUTPUT}")

if __name__ == "__main__":
    extract_metadata()
