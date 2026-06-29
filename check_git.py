import subprocess
result = subprocess.run(['git', 'status'], capture_output=True, text=True)
print(result.stdout)
result2 = subprocess.run(['git', 'diff', '--name-only'], capture_output=True, text=True)
print(result2.stdout)
