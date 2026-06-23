import os
import sys

log_file = open("migrate_log.txt", "w")
def log(msg):
    log_file.write(msg + "\n")
    log_file.flush()

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
        try:
            with open(src_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            content = content.replace("require('./_lib/", "require('./")
            content = content.replace("require('../_lib/", "require('../")
            
            with open(dst_path, "w", encoding="utf-8") as f:
                f.write(content)
                
            log(f"Migrated {filename}")
            
            try:
                os.chmod(src_path, 0o777)
                os.remove(src_path)
                log(f"Deleted original {filename}")
            except Exception as e:
                log(f"Error deleting {filename}: {e}")
        except Exception as e:
            log(f"Error processing {filename}: {e}")
    else:
        log(f"Not found: {filename}")

log_file.close()
