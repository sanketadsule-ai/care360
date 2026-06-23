import subprocess

with open('git_status_output.txt', 'w') as f:
    try:
        output = subprocess.check_output(['git', 'status'], stderr=subprocess.STDOUT)
        f.write(output.decode('utf-8'))
    except subprocess.CalledProcessError as e:
        f.write(e.output.decode('utf-8'))
