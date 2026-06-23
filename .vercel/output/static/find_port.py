import subprocess
import re

with open("port_output.txt", "w") as f:
    try:
        # Run netstat to find port 8080
        output = subprocess.check_output("netstat -ano", shell=True).decode('utf-8', errors='ignore')
        lines = output.splitlines()
        found = False
        pids = set()
        for line in lines:
            if ":8080" in line:
                f.write(line + "\n")
                found = True
                # Netstat format: TCP 0.0.0.0:8080 0.0.0.0:0 LISTENING 1234
                parts = line.strip().split()
                if parts:
                    pid = parts[-1]
                    pids.add(pid)
        
        if not found:
            f.write("No processes found listening on port 8080.\n")
        else:
            # Query tasklist for each PID
            f.write("\nProcess details:\n")
            tasklist_out = subprocess.check_output("tasklist", shell=True).decode('utf-8', errors='ignore')
            for line in tasklist_out.splitlines():
                for pid in pids:
                    # tasklist format has the PID in columns
                    if re.search(r'\b' + re.escape(pid) + r'\b', line):
                        f.write(line + "\n")
    except Exception as e:
        f.write(f"Error: {str(e)}\n")
