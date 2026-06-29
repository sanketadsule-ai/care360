import subprocess
import sys
import os

target_file = 'app.js'

if not os.path.exists(target_file):
    print("Must be run from care360 directory.")
    sys.exit(1)

def get_git_commits():
    result = subprocess.run(['git', 'log', '--format=%H', target_file], capture_output=True, text=True)
    if result.returncode != 0:
        print("Git log failed. Are you in the git repo?")
        sys.exit(1)
    return result.stdout.strip().split('\n')

commits = get_git_commits()
found = False

print(f"Scanning {len(commits)} commits for an uncorrupted version of app.js...")

for commit in commits:
    if not commit: continue
    
    result = subprocess.run(['git', 'show', f'{commit}:{target_file}'], capture_output=True, text=True, encoding='utf-8')
    content = result.stdout
    
    # We define uncorrupted as containing BOTH the initial load logic AND the Twitter mentions logic
    # that went missing.
    is_good = "fetch('/api/connected-channels')" in content and "generateIncomingTwitterMentions" in content
    
    if is_good:
        print(f"Found uncorrupted state at commit {commit[:8]}!")
        with open('app.js', 'w', encoding='utf-8') as f:
            f.write(content)
        found = True
        break

if not found:
    print("Could not find an uncorrupted version in recent git history. The corruption might be very old.")
else:
    print("Successfully restored 'app.js' to the uncorrupted version!")
