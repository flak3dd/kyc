import os
import json
import base64
import requests
from pathlib import Path
from huggingface_hub.file_download import build_hf_headers
from mlcroissant import Dataset

PROCESSED_DIR = Path("../datasets/processed")
DIRS = {
    "id_cards": PROCESSED_DIR / "id_cards",
    "selfies": PROCESSED_DIR / "selfies",
    "spoofing": PROCESSED_DIR / "spoofing_samples"
}

def setup_directories():
    for d in DIRS.values():
        d.mkdir(parents=True, exist_ok=True)

def process_dataset(url, category, limit=10):
    print(f"Processing {category} from {url}...")
    headers = build_hf_headers()
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        jsonld = response.json()
        
        ds = Dataset(jsonld=jsonld)
        records = ds.records("default")
        
        count = 0
        for i, record in enumerate(records):
            if count >= limit:
                break
            
            # This is a generic extraction strategy. 
            # In practice, you will need to map specific fields from each dataset.
            # Look for image URLs or base64 data in the record keys.
            image_url = None
            for key, value in record.items():
                if isinstance(value, str) and (value.startswith("http") or value.endswith((".jpg", ".png"))):
                    image_url = value
                    break
            
            if image_url:
                try:
                    if image_url.startswith("http"):
                        img_resp = requests.get(image_url, headers=headers)
                        img_data = img_resp.content
                    else:
                        print(f"File path found, skipping download: {image_url}")
                        continue
                        
                    out_path = DIRS[category] / f"sample_{i}.jpg"
                    with open(out_path, "wb") as f:
                        f.write(img_data)
                    print(f"Saved {out_path}")
                    count += 1
                except Exception as e:
                    print(f"Error downloading {image_url}: {e}")
                    
    except Exception as e:
        print(f"Failed to process dataset {url}: {e}")

if __name__ == "__main__":
    setup_directories()
    
    # 1. ID Cards (Passports)
    process_dataset(
        "https://huggingface.co/api/datasets/ud-biometrics/synthetic-printed-australian-passports/croissant",
        "id_cards",
        limit=5
    )
    
    # 2. Selfies
    process_dataset(
        "https://huggingface.co/api/datasets/ud-biometrics/Selfie-and-ID-Dataset/croissant",
        "selfies",
        limit=5
    )
    
    # 3. Spoofing Samples
    process_dataset(
        "https://huggingface.co/api/datasets/ud-biometrics/phone-and-webcam-dataset/croissant",
        "spoofing",
        limit=5
    )
    
    print("Preprocessing complete. Ready for ComfyUI.")
