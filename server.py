import http.server
import socketserver
import json
import imaplib
import smtplib
import email
from email.header import decode_header
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import urllib.parse
import urllib.request
import urllib.error
import base64
import os
import sys

PORT = 8080

class Care360RequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type")
        self.end_headers()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_POST(self):
        url_parts = urllib.parse.urlparse(self.path)
        path = url_parts.path
        
        if path == '/api/gmail/test':
            self.handle_gmail_test()
        elif path == '/api/gmail/sync':
            self.handle_gmail_sync()
        elif path == '/api/gmail/send':
            self.handle_gmail_send()
        elif path == '/api/twitter/token':
            self.handle_twitter_token()
        elif path == '/api/twitter/sync':
            self.handle_twitter_sync()
        elif path == '/api/twitter/reply':
            self.handle_twitter_reply()
        else:
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Endpoint not found'}).encode('utf-8'))

    def handle_gmail_test(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            params = json.loads(post_data.decode('utf-8'))
            
            email_addr = params.get('email')
            password = params.get('password')
            imap_host = params.get('imapHost', 'imap.gmail.com')
            imap_port = int(params.get('imapPort', 993))
            
            # Test connection to IMAP
            mail = imaplib.IMAP4_SSL(imap_host, imap_port)
            mail.login(email_addr, password)
            mail.logout()
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
        except Exception as e:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))

    def handle_gmail_sync(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            params = json.loads(post_data.decode('utf-8'))
            
            email_addr = params.get('email')
            password = params.get('password')
            imap_host = params.get('imapHost', 'imap.gmail.com')
            imap_port = int(params.get('imapPort', 993))
            limit = int(params.get('limit', 15))
            
            # Connect to IMAP
            mail = imaplib.IMAP4_SSL(imap_host, imap_port)
            mail.login(email_addr, password)
            mail.select('inbox')
            
            status, messages = mail.search(None, 'ALL')
            if status != 'OK':
                raise Exception("Search in Inbox failed")
                
            mail_ids = messages[0].split()
            latest_ids = mail_ids[-limit:]
            latest_ids.reverse()
            
            emails_list = []
            for mail_id in latest_ids:
                status, data = mail.fetch(mail_id, '(RFC822)')
                if status != 'OK':
                    continue
                raw_email = data[0][1]
                msg = email.message_from_bytes(raw_email)
                
                # Parse subject
                subject = '(No Subject)'
                if msg['Subject']:
                    decoded = decode_header(msg['Subject'])
                    subject_parts = []
                    for val, enc in decoded:
                        if isinstance(val, bytes):
                            try:
                                subject_parts.append(val.decode(enc or 'utf-8', errors='ignore'))
                            except:
                                subject_parts.append(val.decode('utf-8', errors='ignore'))
                        else:
                            subject_parts.append(str(val))
                    subject = "".join(subject_parts)
                    
                # Parse From
                from_ = ''
                if msg['From']:
                    decoded = decode_header(msg['From'])
                    from_parts = []
                    for val, enc in decoded:
                        if isinstance(val, bytes):
                            try:
                                from_parts.append(val.decode(enc or 'utf-8', errors='ignore'))
                            except:
                                from_parts.append(val.decode('utf-8', errors='ignore'))
                        else:
                            from_parts.append(str(val))
                    from_ = "".join(from_parts)
                    
                # Parse Date
                date_ = msg['Date'] or ''
                
                # Parse body
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        content_type = part.get_content_type()
                        content_disposition = str(part.get("Content-Disposition"))
                        if content_type == "text/plain" and "attachment" not in content_disposition:
                            try:
                                body = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                                break
                            except:
                                pass
                else:
                    try:
                        body = msg.get_payload(decode=True).decode('utf-8', errors='ignore')
                    except:
                        pass
                
                if not body.strip():
                    body = raw_email.decode('utf-8', errors='ignore')[:500] + "\n...(parsed raw text)"
                        
                emails_list.append({
                    'id': mail_id.decode(),
                    'from': from_,
                    'subject': subject,
                    'date': date_,
                    'body': body,
                    'message_id': msg['Message-ID'] or ''
                })
                
            mail.close()
            mail.logout()
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'emails': emails_list}).encode('utf-8'))
        except Exception as e:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))

    def handle_gmail_send(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            params = json.loads(post_data.decode('utf-8'))
            
            email_addr = params.get('email')
            password = params.get('password')
            smtp_host = params.get('smtpHost', 'smtp.gmail.com')
            smtp_port = int(params.get('smtpPort', 587))
            
            to_email = params.get('to')
            subject = params.get('subject')
            body = params.get('body')
            in_reply_to = params.get('inReplyTo')
            
            msg = MIMEMultipart()
            msg['From'] = email_addr
            msg['To'] = to_email
            msg['Subject'] = subject
            
            if in_reply_to:
                msg['In-Reply-To'] = in_reply_to
                msg['References'] = in_reply_to
                
            msg.attach(MIMEText(body, 'plain', 'utf-8'))
            
            # SMTP connection
            server = smtplib.SMTP(smtp_host, smtp_port)
            server.starttls()
            server.login(email_addr, password)
            server.sendmail(email_addr, to_email, msg.as_string())
            server.quit()
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
        except Exception as e:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))

    def handle_twitter_token(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            params = json.loads(post_data.decode('utf-8'))
            
            code = params.get('code')
            code_verifier = params.get('code_verifier')
            redirect_uri = params.get('redirect_uri')
            client_id = params.get('client_id')
            
            # Use basic auth or just pass client_id in body for public clients
            # Since this is a public client (PKCE), we don't strictly need client_secret
            token_url = 'https://api.twitter.com/2/oauth2/token'
            data = urllib.parse.urlencode({
                'code': code,
                'grant_type': 'authorization_code',
                'client_id': client_id,
                'redirect_uri': redirect_uri,
                'code_verifier': code_verifier
            }).encode('utf-8')
            
            req = urllib.request.Request(token_url, data=data)
            req.add_header('Content-Type', 'application/x-www-form-urlencoded')
            
            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode('utf-8'))
                
            # If successful, get user info
            if 'access_token' in result:
                access_token = result['access_token']
                user_req = urllib.request.Request('https://api.twitter.com/2/users/me')
                user_req.add_header('Authorization', f'Bearer {access_token}')
                with urllib.request.urlopen(user_req) as u_resp:
                    user_info = json.loads(u_resp.read().decode('utf-8'))['data']
                    
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': True,
                    'user': {
                        'name': user_info.get('name'),
                        'username': user_info.get('username'),
                        'id': user_info.get('id'),
                        'accessToken': access_token,
                        'refreshToken': result.get('refresh_token')
                    }
                }).encode('utf-8'))
            else:
                raise Exception("Token missing from response")
                
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': err_msg}).encode('utf-8'))
        except Exception as e:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))

    def handle_twitter_sync(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            params = json.loads(post_data.decode('utf-8'))
            
            access_token = params.get('access_token')
            if not access_token:
                raise Exception("Missing access token")
                
            # Fetch user ID first to get mentions
            user_req = urllib.request.Request('https://api.twitter.com/2/users/me')
            user_req.add_header('Authorization', f'Bearer {access_token}')
            with urllib.request.urlopen(user_req) as u_resp:
                user_id = json.loads(u_resp.read().decode('utf-8'))['data']['id']
                
            # Fetch mentions
            mentions_url = f'https://api.twitter.com/2/users/{user_id}/mentions?max_results=10&tweet.fields=created_at,author_id'
            req = urllib.request.Request(mentions_url)
            req.add_header('Authorization', f'Bearer {access_token}')
            
            try:
                with urllib.request.urlopen(req) as response:
                    result = json.loads(response.read().decode('utf-8'))
                    mentions = result.get('data', [])
            except urllib.error.HTTPError as e:
                # If no mentions, twitter returns 200 with meta.result_count=0 or sometimes 404? 
                # Actually, standard is 200.
                if e.code == 404:
                    mentions = []
                else:
                    raise e
                    
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'mentions': mentions}).encode('utf-8'))
            
        except Exception as e:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))

    def handle_twitter_reply(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            params = json.loads(post_data.decode('utf-8'))
            
            access_token = params.get('access_token')
            tweet_id = params.get('tweet_id')
            text = params.get('text')
            
            if not access_token or not tweet_id or not text:
                raise Exception("Missing parameters")
                
            url = 'https://api.twitter.com/2/tweets'
            payload = json.dumps({
                "text": text,
                "reply": {
                    "in_reply_to_tweet_id": tweet_id
                }
            }).encode('utf-8')
            
            req = urllib.request.Request(url, data=payload)
            req.add_header('Authorization', f'Bearer {access_token}')
            req.add_header('Content-Type', 'application/json')
            
            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode('utf-8'))
                
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'data': result.get('data')}).encode('utf-8'))
            
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': err_msg}).encode('utf-8'))
        except Exception as e:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))

if __name__ == '__main__':
    # Serve from the parent directory so that /care360/ paths work correctly
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(os.path.dirname(script_dir))
    
    handler = Care360RequestHandler
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"Care360 Sync Server running at http://localhost:{PORT}/")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            sys.exit(0)
