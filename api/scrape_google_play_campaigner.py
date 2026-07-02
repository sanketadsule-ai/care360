import os
import sys
import csv
import time
from datetime import datetime

# Accept package name or define default
PACKAGE_NAME = "com.impactguru.campaigner_app"
APP_NAME = "Impact Guru - Campaigner (For Fundraisers)"

def load_env():
    # .env is located in the parent directory of this api folder
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip("'").strip('"'))

def analyze_review(comment):
    api_key = os.environ.get("AZURE_OPENAI_API_KEY")
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    deployment_name = os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME")
    api_version = os.environ.get("AZURE_OPENAI_API_VERSION") or "2024-12-01-preview"
    
    default_res = {
        "priority": "P3",
        "next_action": "Assess review and route to appropriate department.",
        "department": "Support",
        "user_type": "Inquirer"
    }
    
    if not api_key or not endpoint or not deployment_name:
        return default_res
        
    system_prompt = (
        "You are an AI assistant that analyzes Instagram captions. Analyze the provided caption and extract the following information. "
        "You must respond strictly in valid JSON format with these exact keys: "
        "priority (Choose one: \"P0\", \"P1\", \"P2\", \"P3\", \"P4\", \"P5\") "
        "next_action (A brief description of what action needs to be taken next) "
        "department (The department that should handle this, e.g., Support, Sales, Marketing, HR) "
        "user_type (Categorize the user, e.g., \"Campaigner\", \"Donor\", \"Inquirer\") "
        "Do not include any conversational text, code blocks, or markdown formatting in your response. Return only the raw JSON object."
    )
    user_content = f"caption: {comment or ''}"
    
    try:
        import urllib.request
        import json
        import re
        
        url = f"{endpoint.rstrip('/')}/openai/deployments/{deployment_name}/chat/completions?api-version={api_version}"
        headers = {
            "api-key": api_key,
            "Content-Type": "application/json"
        }
        payload = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            "temperature": 0
        }
        
        req_data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=req_data, headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=10) as res:
            res_data = json.loads(res.read().decode('utf-8'))
            
        content = res_data["choices"][0]["message"]["content"].strip()
        
        if "```" in content:
            match = re.search(r'```(?:json)?([\s\S]*?)```', content)
            if match:
                content = match.group(1).strip()
                
        parsed = json.loads(content)
        return {
            "priority": parsed.get("priority") or default_res["priority"],
            "next_action": parsed.get("next_action") or default_res["next_action"],
            "department": parsed.get("department") or default_res["department"],
            "user_type": parsed.get("user_type") or default_res["user_type"]
        }
    except Exception as e:
        print(f"Error during LLM analysis: {e}")
        return default_res

def main():
    load_env()
    
    try:
        from google_play_scraper import Sort, reviews_all
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "google-play-scraper"])
        from google_play_scraper import Sort, reviews_all

    print(f"Scraping reviews for package: {PACKAGE_NAME}...")
    try:
        result = reviews_all(
            PACKAGE_NAME,
            lang='en',
            sort=Sort.NEWEST
        )
    except Exception as e:
        print(f"Failed to scrape reviews from Google Play: {e}")
        sys.exit(1)

    # Pre-analyze all comments using LLM
    print("Performing AI review analysis and classification...")
    analyzed_reviews = []
    for idx, r in enumerate(result):
        comment = r['content'] or ''
        # Optional: Print progress for long sets
        if idx % 50 == 0:
            print(f"  Analyzed {idx}/{len(result)} reviews...")
        escalation = analyze_review(comment)
        analyzed_reviews.append((r, escalation))

    # 1. Save to local CSV file
    base_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    csv_file = os.path.join(base_dir, f"google_play_{PACKAGE_NAME}_reviews.csv")
    try:
        with open(csv_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Review ID', 'UserName', 'Rating', 'Comment', 'Date', 'Priority', 'NextAction', 'Department', 'UserType'])
            for r, esc in analyzed_reviews:
                writer.writerow([
                    r['reviewId'],
                    r['userName'],
                    r['score'],
                    r['content'],
                    r['at'],
                    esc['priority'],
                    esc['next_action'],
                    esc['department'],
                    esc['user_type']
                ])
        print(f"Saved {len(analyzed_reviews)} reviews locally to {csv_file}")
    except Exception as e:
        print(f"Failed to write CSV: {e}")

    # 2. Save to database if DATABASE_URL is present
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not set. Skipping database sync.")
        return

    try:
        import psycopg2
        db_url_clean = db_url.split("?")[0]
        conn = psycopg2.connect(db_url_clean, sslmode="require")
        conn.autocommit = True
        cur = conn.cursor()

        # Set RLS bypass for migration/script
        cur.execute("SET LOCAL app.current_org_id = ''")

        # 1. Get or create Carepal360 org
        cur.execute("SELECT id FROM organizations WHERE slug = 'carepal360'")
        org_row = cur.fetchone()
        if not org_row:
            cur.execute("INSERT INTO organizations (name, slug) VALUES ('Carepal360', 'carepal360') RETURNING id")
            org_id = cur.fetchone()[0]
        else:
            org_id = org_row[0]

        # 2. Get or create Channel
        cur.execute(
            "SELECT id FROM channels WHERE organization_id = %s AND platform = 'google_play' AND external_id = %s LIMIT 1",
            (org_id, PACKAGE_NAME)
        )
        row = cur.fetchone()
        if row:
            channel_id = row[0]
        else:
            cur.execute(
                "INSERT INTO channels (organization_id, platform, external_id, display_name, status) VALUES (%s, 'google_play', %s, %s, 'active') RETURNING id",
                (org_id, PACKAGE_NAME, APP_NAME)
            )
            channel_id = cur.fetchone()[0]

        # 3. Upsert reviews
        saved_count = 0
        for r, esc in analyzed_reviews:
            review_id = r['reviewId']
            author_name = r['userName'] or 'Unknown'
            rating = r['score']
            comment = r['content'] or ''
            received_at = r['at']

            platform_user_id = (author_name.lower().replace(" ", "_") + "_" + review_id)

            # Insert Contact
            cur.execute("""
                INSERT INTO contacts (channel_id, platform_user_id, name)
                VALUES (%s, %s, %s)
                ON CONFLICT (channel_id, platform_user_id) DO UPDATE SET updated_at = NOW()
                RETURNING id
            """, (channel_id, platform_user_id, author_name))
            contact_id = cur.fetchone()[0]

            # Insert Conversation
            cur.execute("""
                INSERT INTO conversations (organization_id, channel_id, platform_thread_id, title, platform, type, status, priority, next_action, department, user_type, platform_created_at, created_at)
                VALUES (%s, %s, %s, %s, 'google_play', 'Review', 'open', %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (channel_id, platform_thread_id) DO UPDATE SET
                    priority = EXCLUDED.priority,
                    next_action = EXCLUDED.next_action,
                    department = EXCLUDED.department,
                    user_type = EXCLUDED.user_type,
                    updated_at = NOW()
                RETURNING id
            """, (org_id, channel_id, review_id, author_name, esc['priority'], esc['next_action'], esc['department'], esc['user_type'], received_at))
            conv_id = cur.fetchone()[0]

            # Insert Message
            cur.execute("""
                INSERT INTO messages (conversation_id, contact_id, sender_type, visibility, content, platform_message_id, rating, status, platform_created_at, created_at)
                VALUES (%s, %s, 'customer', 'public', %s, %s, %s, 'received', %s, NOW())
                ON CONFLICT (conversation_id, platform_message_id) DO UPDATE SET
                    content = EXCLUDED.content,
                    rating = EXCLUDED.rating
            """, (conv_id, contact_id, comment, review_id, rating, received_at))
            
            saved_count += 1

        print(f"Successfully upserted {saved_count} Google Play reviews into the database.")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Failed to sync with database: {e}")

if __name__ == "__main__":
    main()
