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

# ── Load .env file ──────────────────────────────────────
def load_env():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    os.environ[key.strip()] = val.strip()

load_env()

# Session store for mock local auth
SESSION_USER = {
    'id': 'mock-admin-id',
    'email': 'admin@carapal360.com',
    'name': 'Admin User',
    'initials': 'AU',
    'avatar_url': '',
    'role': 'admin',
    'status': 'approved'
}

SESSION_USERS_LIST = [
    {
        'id': 101,
        'email': 'john.doe@example.com',
        'name': 'John Doe',
        'initials': 'JD',
        'avatar_url': '',
        'role': 'user',
        'status': 'pending'
    },
    {
        'id': 102,
        'email': 'jane.smith@example.com',
        'name': 'Jane Smith',
        'initials': 'JS',
        'avatar_url': '',
        'role': 'user',
        'status': 'approved'
    }
]

MOCK_CONNECTED_CHANNELS = []
MOCK_GOOGLE_REVIEWS = []

PORT = 8080

class Care360RequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type, Authorization")
        self.end_headers()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()

    def do_GET(self):
        global MOCK_CONNECTED_CHANNELS
        global MOCK_GOOGLE_REVIEWS
        url_parts = urllib.parse.urlparse(self.path)
        path = url_parts.path
        
        if path == '/api/twitter-connect':
            self.handle_twitter_connect()
        elif path == '/api/twitter-sync':
            self.handle_twitter_sync_get()
        elif path == '/api/connected-channels':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'data': MOCK_CONNECTED_CHANNELS}).encode('utf-8'))
        elif path == '/api/user-profile':
            self.handle_user_profile()
        elif path == '/api/admin-users':
            self.handle_get_admin_users()
        elif path in ['/api/facebook-messages', '/api/platform-messages']:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'data': []}).encode('utf-8'))
        elif path == '/api/google-reviews':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'data': MOCK_GOOGLE_REVIEWS}).encode('utf-8'))
        elif path == '/api/google-reviews-sync':
            new_reviews = []
            for ch in MOCK_CONNECTED_CHANNELS:
                if ch.get('platform') == 'google_business' and ch.get('access_token'):
                    try:
                        acc = ch.get('account_email') # accounts/123
                        loc = ch.get('account_id') # locations/456
                        if acc and loc:
                            url = f"https://mybusiness.googleapis.com/v4/{acc}/{loc}/reviews"
                            headers = {'Authorization': f"Bearer {ch['access_token']}"}
                            req = urllib.request.Request(url, headers=headers)
                            res = urllib.request.urlopen(req)
                            rev_data = json.loads(res.read().decode('utf-8'))
                            for item in rev_data.get('reviews', []):
                                new_reviews.append({
                                    'id': item.get('reviewId'),
                                    'review_id': item.get('reviewId'),
                                    'rating': item.get('starRating'),
                                    'author_name': item.get('reviewer', {}).get('displayName', 'Unknown'),
                                    'author_avatar': item.get('reviewer', {}).get('profilePhotoUrl', ''),
                                    'comment': item.get('comment', ''),
                                    'received_at': item.get('createTime'),
                                    'platform': 'google_business',
                                    'status': 'open'
                                })
                    except Exception as e:
                        print(f"[DEBUG] Error fetching Google reviews: {e}")
            
            # Simple merge to avoid duplicates in mock store
            existing_ids = {r['id'] for r in MOCK_GOOGLE_REVIEWS}
            for r in new_reviews:
                if r['id'] not in existing_ids:
                    MOCK_GOOGLE_REVIEWS.append(r)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'synced_count': len(new_reviews)}).encode('utf-8'))
        elif path == '/api/facebook-sync':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'synced_count': 0}).encode('utf-8'))
        else:
            # Fall through to serve static files
            super().do_GET()

    def do_POST(self):
        global MOCK_CONNECTED_CHANNELS
        url_parts = urllib.parse.urlparse(self.path)
        path = url_parts.path.rstrip('/')
        
        print(f"[DEBUG] POST request to path: '{path}' (Original: '{self.path}')")
        
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
        elif path == '/api/connected-channels':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length > 0:
                    post_data = self.rfile.read(content_length)
                    payload = json.loads(post_data.decode('utf-8'))
                    
                    if payload.get('platform') == 'google_business' and payload.get('access_token'):
                        try:
                            access_token = payload['access_token']
                            headers = {'Authorization': f'Bearer {access_token}'}
                            # Fetch Account
                            req = urllib.request.Request('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', headers=headers)
                            res = urllib.request.urlopen(req)
                            accounts_data = json.loads(res.read().decode('utf-8'))
                            
                            if accounts_data.get('accounts'):
                                account_name = accounts_data['accounts'][0]['name']
                                # Fetch Location
                                loc_req = urllib.request.Request(f'https://mybusinessbusinessinformation.googleapis.com/v1/{account_name}/locations?readMask=name,title', headers=headers)
                                loc_res = urllib.request.urlopen(loc_req)
                                locations_data = json.loads(loc_res.read().decode('utf-8'))
                                
                                if locations_data.get('locations'):
                                    loc = locations_data['locations'][0]
                                    payload['account_id'] = loc['name'] # locations/XYZ
                                    payload['account_name'] = loc.get('title', 'Google Business Profile')
                                    payload['account_email'] = account_name # accounts/ABC
                        except Exception as inner_e:
                            print(f"[DEBUG] Google Business API error: {inner_e}")
                            
                    MOCK_CONNECTED_CHANNELS.append(payload)
            except Exception as e:
                print(f"[DEBUG] Error parsing connected-channels POST: {e}")
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'data': {}}).encode('utf-8'))
        elif path == '/api/auth':
            self.handle_auth()
        elif path == '/api/admin-users':
            self.handle_post_admin_users()
        elif path == '/api/facebook-messages' or path == '/api/platform-messages':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
        else:
            print(f"[DEBUG] Returning 404 for POST path: '{path}'")
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': f'Endpoint not found: {path}'}).encode('utf-8'))

    def do_DELETE(self):
        url_parts = urllib.parse.urlparse(self.path)
        path = url_parts.path
        
        if path == '/api/connected-channels':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
        else:
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Endpoint not found'}).encode('utf-8'))

    def handle_auth(self):
        global SESSION_USER
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            params = json.loads(post_data.decode('utf-8'))
            credential = params.get('credential')
            
            email = 'admin@carapal360.com'
            name = 'Admin User'
            picture = ''
            
            if credential:
                parts = credential.split('.')
                if len(parts) >= 2:
                    payload_b64 = parts[1]
                    payload_b64 += '=' * (4 - len(payload_b64) % 4)
                    try:
                        payload_json = base64.b64decode(payload_b64).decode('utf-8')
                        user_info = json.loads(payload_json)
                        email = user_info.get('email', email)
                        name = user_info.get('name', name)
                        picture = user_info.get('picture', picture)
                    except Exception as parse_err:
                        print("Failed to parse Google JWT payload:", parse_err)
            
            initials = "".join([part[0] for part in name.split()]).upper()[:2] if name else 'AU'
            
            SESSION_USER = {
                'id': 'mock-user-' + email.split('@')[0],
                'email': email,
                'name': name,
                'initials': initials,
                'avatar_url': picture,
                'role': 'admin',
                'status': 'approved'
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'token': 'mock-jwt-token-for-' + email,
                'user': SESSION_USER
            }).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))

    def handle_user_profile(self):
        global SESSION_USER
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({
            'success': True,
            'data': SESSION_USER
        }).encode('utf-8'))

    def handle_get_admin_users(self):
        global SESSION_USERS_LIST
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({
            'success': True,
            'users': SESSION_USERS_LIST
        }).encode('utf-8'))

    def handle_post_admin_users(self):
        global SESSION_USERS_LIST
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            params = json.loads(post_data.decode('utf-8'))
            user_id = params.get('userId')
            action = params.get('action')
            
            for user in SESSION_USERS_LIST:
                if str(user['id']) == str(user_id):
                    if action == 'approve':
                        user['status'] = 'approved'
                    elif action == 'reject':
                        user['status'] = 'rejected'
                    break
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'message': f"User {action}d successfully"
            }).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))

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

    def handle_twitter_connect(self):
        """GET /api/twitter/connect — Uses tokens from .env to verify and return user info."""
        try:
            access_token = os.environ.get('TWITTER_ACCESS_TOKEN', '')
            refresh_token = os.environ.get('TWITTER_REFRESH_TOKEN', '')
            client_id = os.environ.get('TWITTER_CLIENT_ID', '')
            client_secret = os.environ.get('TWITTER_CLIENT_SECRET', '')

            if not access_token:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': 'No Twitter tokens in .env'}).encode('utf-8'))
                return

            # Try to get user info with current access token
            try:
                user_req = urllib.request.Request('https://api.twitter.com/2/users/me?user.fields=profile_image_url,description')
                user_req.add_header('Authorization', f'Bearer {access_token}')
                with urllib.request.urlopen(user_req) as u_resp:
                    user_info = json.loads(u_resp.read().decode('utf-8'))['data']
            except urllib.error.HTTPError as e:
                if e.code == 401 and refresh_token and client_id:
                    # Token expired — refresh it
                    token_url = 'https://api.twitter.com/2/oauth2/token'
                    refresh_data = urllib.parse.urlencode({
                        'grant_type': 'refresh_token',
                        'refresh_token': refresh_token,
                        'client_id': client_id,
                    }).encode('utf-8')
                    refresh_req = urllib.request.Request(token_url, data=refresh_data)
                    refresh_req.add_header('Content-Type', 'application/x-www-form-urlencoded')
                    if client_secret:
                        auth_str = base64.b64encode(f'{client_id}:{client_secret}'.encode()).decode()
                        refresh_req.add_header('Authorization', f'Basic {auth_str}')

                    with urllib.request.urlopen(refresh_req) as r_resp:
                        new_tokens = json.loads(r_resp.read().decode('utf-8'))

                    access_token = new_tokens['access_token']
                    new_refresh = new_tokens.get('refresh_token', refresh_token)

                    # Update .env file with new tokens
                    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
                    if os.path.exists(env_path):
                        with open(env_path, 'r') as f:
                            content = f.read()
                        content = content.replace(os.environ.get('TWITTER_ACCESS_TOKEN', ''), access_token)
                        content = content.replace(os.environ.get('TWITTER_REFRESH_TOKEN', ''), new_refresh)
                        with open(env_path, 'w') as f:
                            f.write(content)

                    os.environ['TWITTER_ACCESS_TOKEN'] = access_token
                    os.environ['TWITTER_REFRESH_TOKEN'] = new_refresh

                    # Retry user info with new token
                    user_req = urllib.request.Request('https://api.twitter.com/2/users/me?user.fields=profile_image_url,description')
                    user_req.add_header('Authorization', f'Bearer {access_token}')
                    with urllib.request.urlopen(user_req) as u_resp:
                        user_info = json.loads(u_resp.read().decode('utf-8'))['data']
                else:
                    raise e

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'user': {
                    'name': user_info.get('name'),
                    'username': user_info.get('username'),
                    'id': user_info.get('id'),
                    'profile_image_url': user_info.get('profile_image_url', ''),
                    'description': user_info.get('description', '')
                }
            }).encode('utf-8'))

        except Exception as e:
            print("ERROR IN TWITTER CONNECT (falling back to App Bearer Token):", str(e))
            try:
                bearer_token = os.environ.get('TWITTER_BEARER_TOKEN', '')
                req = urllib.request.Request('https://api.twitter.com/2/users/by/username/TwitterDev?user.fields=profile_image_url,description')
                req.add_header('Authorization', f'Bearer {bearer_token}')
                with urllib.request.urlopen(req) as u_resp:
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
                        'profile_image_url': user_info.get('profile_image_url', ''),
                        'description': user_info.get('description', '')
                    }
                }).encode('utf-8'))
            except Exception as fallback_e:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(fallback_e)}).encode('utf-8'))

    def handle_twitter_sync_get(self):
        """GET /api/twitter-sync — Uses Bearer token to fetch real tweets."""
        try:
            # Always use the App Bearer Token — it works reliably
            bearer_token = os.environ.get('TWITTER_BEARER_TOKEN', '')
            access_token = os.environ.get('TWITTER_ACCESS_TOKEN', '')

            # Try OAuth token first for /users/me, fall back to Bearer for a known user
            user_id = None
            username = None
            using_bearer = False

            if access_token:
                try:
                    user_req = urllib.request.Request('https://api.twitter.com/2/users/me')
                    user_req.add_header('Authorization', f'Bearer {access_token}')
                    with urllib.request.urlopen(user_req) as u_resp:
                        me_data = json.loads(u_resp.read().decode('utf-8'))['data']
                        user_id = me_data['id']
                        username = me_data.get('username', '')
                        print(f"TWITTER SYNC: OAuth OK, user_id={user_id}, username={username}")
                except Exception as e:
                    print(f"TWITTER SYNC: OAuth failed ({e}), falling back to Bearer token")

            if not user_id and bearer_token:
                using_bearer = True
                try:
                    user_req = urllib.request.Request('https://api.twitter.com/2/users/by/username/TwitterDev')
                    user_req.add_header('Authorization', f'Bearer {bearer_token}')
                    with urllib.request.urlopen(user_req) as u_resp:
                        me_data = json.loads(u_resp.read().decode('utf-8'))['data']
                        user_id = me_data['id']
                        username = me_data.get('username', 'TwitterDev')
                        print(f"TWITTER SYNC: Bearer OK, user_id={user_id}, username={username}")
                except Exception as e2:
                    print(f"TWITTER SYNC: Bearer also failed: {e2}")
                    raise Exception(f"Both OAuth and Bearer tokens failed: {e2}")

            # Use the token that works for API calls
            token = bearer_token if using_bearer else access_token
            if not token:
                token = bearer_token  # final fallback

            # Fetch recent tweets by user (their timeline)
            tweets = []
            try:
                timeline_url = f'https://api.twitter.com/2/users/{user_id}/tweets?max_results=10&tweet.fields=created_at,text,author_id'
                req = urllib.request.Request(timeline_url)
                req.add_header('Authorization', f'Bearer {token}')
                with urllib.request.urlopen(req) as response:
                    result = json.loads(response.read().decode('utf-8'))
                    tweets = result.get('data', [])
                    print(f"TWITTER SYNC: Got {len(tweets)} tweets from timeline")
            except Exception as e:
                print(f"TWITTER SYNC: Timeline fetch failed: {e}")

            # Fetch mentions — try user-context first, then search as fallback
            mentions = []
            try:
                mentions_url = f'https://api.twitter.com/2/users/{user_id}/mentions?max_results=10&tweet.fields=created_at,author_id,text'
                req2 = urllib.request.Request(mentions_url)
                req2.add_header('Authorization', f'Bearer {token}')
                with urllib.request.urlopen(req2) as response:
                    result = json.loads(response.read().decode('utf-8'))
                    mentions = result.get('data', [])
                    print(f"TWITTER SYNC: Got {len(mentions)} mentions")
            except Exception as e:
                print(f"TWITTER SYNC: Mentions fetch failed ({e}), trying search/recent fallback...")
                # Fallback: use search/recent to find tweets mentioning the user
                if username and bearer_token:
                    try:
                        search_url = f'https://api.twitter.com/2/tweets/search/recent?query=%40{username}&max_results=10&tweet.fields=created_at,author_id,text'
                        req3 = urllib.request.Request(search_url)
                        req3.add_header('Authorization', f'Bearer {bearer_token}')
                        with urllib.request.urlopen(req3) as response:
                            result = json.loads(response.read().decode('utf-8'))
                            mentions = result.get('data', [])
                            print(f"TWITTER SYNC: Got {len(mentions)} mentions from search/recent")
                    except Exception as e3:
                        print(f"TWITTER SYNC: Search fallback also failed: {e3}")

            total = len(tweets) + len(mentions)
            print(f"TWITTER SYNC: Returning {len(tweets)} tweets + {len(mentions)} mentions = {total} total")

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'tweets': tweets,
                'mentions': mentions
            }).encode('utf-8'))

        except Exception as e:
            print(f"TWITTER SYNC ERROR: {e}")
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
            
            tweet_id = params.get('tweet_id')
            text = params.get('text')
            access_token = os.environ.get('TWITTER_ACCESS_TOKEN', '')
            
            if not access_token:
                raise Exception("Missing TWITTER_ACCESS_TOKEN in .env")

            if not tweet_id or not text:
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
