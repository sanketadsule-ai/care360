import socket
import sys

with open(r"c:\Users\6451\Documents\care360\care360\test_port_bind_output.txt", "w") as f:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('127.0.0.1', 8085))
        s.close()
        f.write("PORT_8085_IS_FREE\n")
    except Exception as e:
        f.write(f"PORT_8085_IS_OCCUPIED: {e}\n")



