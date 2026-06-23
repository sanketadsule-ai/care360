import os
import glob

api_dir = r"c:\Users\6451\Documents\care360\care360\api"
lib_dir = os.path.join(api_dir, "_lib")

endpoints = [
    "admin-users.js",
    "auth.js",
    "connected-channels.js",
    "facebook-messages.js",
    "platform-messages.js",
    "twitter-connect.js",
    "twitter-reply.js",
    "twitter-sync.js",
    "twitter-token.js",
    "user-profile.js"
]

for filename in endpoints:
    src_path = os.path.join(api_dir, filename)
    dst_path = os.path.join(lib_dir, filename)
    
    if os.path.exists(src_path):
        with open(src_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Update imports: require('./_lib/xxx') becomes require('./xxx')
        # Also require('../_lib/xxx') becomes require('./xxx') just in case
        content = content.replace("require('./_lib/", "require('./")
        content = content.replace("require('../_lib/", "require('../")
        
        with open(dst_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        print(f"Migrated {filename}")
        
        # Delete original
        try:
            os.remove(src_path)
            print(f"Deleted original {filename}")
        except Exception as e:
            print(f"Error deleting {filename}: {e}")
