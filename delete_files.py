import os
import sys
import stat

files_to_delete = [
    r"c:\Users\6451\Documents\care360\care360\api\db.js",
    r"c:\Users\6451\Documents\care360\care360\api\auth-helper.js",
    r"c:\Users\6451\Documents\care360\care360\api\db-schema.js"
]

for f in files_to_delete:
    try:
        if os.path.exists(f):
            os.chmod(f, stat.S_IWRITE)
            os.remove(f)
            print(f"Deleted {f}")
        else:
            print(f"Not found: {f}")
    except Exception as e:
        print(f"Error deleting {f}: {e}")
