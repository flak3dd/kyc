#!/usr/bin/env python3
"""
Downloader for conradlocke/krea2-identity-edit LoRA weights from Hugging Face.
Supports full v1.2, rank-128, and rank-64 low-VRAM variants.
"""

import os
import sys
import argparse
from pathlib import Path

def download_krea2_weights(variant: str = "v1_2", output_dir: str = None, token: str = None):
    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        print("Error: huggingface_hub is not installed. Run: pip install huggingface_hub --break-system-packages")
        sys.exit(1)

    repo_id = "conradlocke/krea2-identity-edit"
    hf_token = token or os.getenv("HF_TOKEN")

    files_map = {
        "v1_2": "krea2_identity_edit_v1_2.safetensors",
        "v1_2_r128": "krea2_identity_edit_v1_2_r128.safetensors",
        "v1_2_r64": "krea2_identity_edit_v1_2_r64.safetensors",
        "v1_1": "krea2_identity_edit_v1_1.safetensors",
        "v1": "krea2_identity_edit_v1.safetensors"
    }

    if variant == "all":
        target_files = [
            "krea2_identity_edit_v1_2.safetensors",
            "krea2_identity_edit_v1_2_r128.safetensors",
            "krea2_identity_edit_v1_2_r64.safetensors"
        ]
    elif variant in files_map:
        target_files = [files_map[variant]]
    else:
        print(f"Unknown variant '{variant}'. Options: {list(files_map.keys())} or 'all'")
        sys.exit(1)

    # Determine destination directory
    if not output_dir:
        # Check standard ComfyUI paths or fallback to models/loras
        candidates = [
            Path("/home/flak3dd/ComfyUI/models/loras"),
            Path("../ComfyUI/models/loras"),
            Path("./models/loras"),
            Path("../models/loras")
        ]
        chosen = None
        for c in candidates:
            if c.parent.exists():
                chosen = c
                break
        dest_dir = chosen or Path("./models/loras")
    else:
        dest_dir = Path(output_dir)

    dest_dir.mkdir(parents=True, exist_ok=True)
    print(f"Target repository: {repo_id}")
    print(f"Destination folder: {dest_dir.resolve()}")
    print(f"Files to download: {target_files}")

    for filename in target_files:
        print(f"\nDownloading {filename}...")
        try:
            downloaded_path = hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                local_dir=str(dest_dir),
                token=hf_token
            )
            print(f"Successfully downloaded: {downloaded_path}")
        except Exception as e:
            print(f"Failed to download {filename}: {e}")
            if not hf_token:
                print("Tip: If the repository requires authentication, export HF_TOKEN or pass --token.")

    print("\n--- ComfyUI Setup Reminder ---")
    print("1. Install custom node pack:")
    print("   cd ComfyUI/custom_nodes && git clone https://github.com/lbouaraba/comfyui-krea2edit")
    print("2. Ensure base model is available:")
    print("   UNet: Comfy-Org/Krea-2/diffusion_models/krea2_turbo_fp8_scaled.safetensors")
    print("   CLIP: Comfy-Org/Krea-2/text_encoders/qwen3vl_4b_fp8_scaled.safetensors")
    print("   VAE:  ae.safetensors")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download conradlocke/krea2-identity-edit LoRA for ComfyUI")
    parser.add_argument("--variant", default="v1_2", choices=["v1_2", "v1_2_r128", "v1_2_r64", "v1_1", "v1", "all"],
                        help="Model variant (default: v1_2, low-vram: v1_2_r128 or v1_2_r64)")
    parser.add_argument("--output-dir", default=None, help="Directory to save the weights (default: ComfyUI models/loras)")
    parser.add_argument("--token", default=None, help="Hugging Face API token (defaults to HF_TOKEN env var)")

    args = parser.parse_args()
    download_krea2_weights(variant=args.variant, output_dir=args.output_dir, token=args.token)
