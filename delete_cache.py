import shutil
import os

target_dir = os.path.join(os.path.dirname(__file__), '.vercel', 'output')
if os.path.exists(target_dir):
    shutil.rmtree(target_dir)
    print(f"Deleted {target_dir}")
else:
    print(f"Directory not found: {target_dir}")
