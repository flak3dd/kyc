import os
from pathlib import Path

def bundle_workspace(root_dir: str, output_file: str):
    """
    Scans the given directory and concatenates code/markdown files into a single text file.
    This makes it easy to drag and drop the entire context into an AI CLI.
    """
    root = Path(root_dir)
    out_path = Path(output_file)
    
    # Extensions to include
    target_exts = {'.py', '.md', '.json', '.sh', '.yaml', '.txt'}
    # Directories to ignore
    ignore_dirs = {'.git', '__pycache__', 'venv', '.spark-client', 'llm_results', 'processed'}
    
    with open(out_path, 'w', encoding='utf-8') as f_out:
        f_out.write(f"# Workspace Context Bundle\nRoot: {root.absolute()}\n\n")
        
        for root_path, dirs, files in os.walk(root):
            # Modify dirs in-place to skip ignored directories
            dirs[:] = [d for d in dirs if d not in ignore_dirs and not d.startswith('.')]
            
            for file in files:
                file_path = Path(root_path) / file
                if file_path.suffix in target_exts:
                    f_out.write(f"## File: {file_path.relative_to(root)}\n")
                    f_out.write("```\n")
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f_in:
                            f_out.write(f_in.read())
                    except Exception as e:
                        f_out.write(f"[Error reading file: {e}]\n")
                    f_out.write("\n```\n\n")
                    
    print(f"Successfully bundled workspace into: {out_path.absolute()}")

if __name__ == "__main__":
    # Pointing to the workspace root
    workspace_dir = "../"
    output = "workspace_context.md"
    bundle_workspace(workspace_dir, output)
