"""
Direct Trustpilot -> Postgres scraper.

Why this exists:
  - Trustpilot returns HTTP 403 to plain requests/fetch (anti-bot), so we drive a
    real Chrome browser via Selenium and read the reviews that Trustpilot embeds in
    the page as JSON (<script id="__NEXT_DATA__">).
  - It writes straight into the `trustpilot_reviews` table — no CSV, no :8080 server.

Run:
    python scrape_trustpilot_to_db.py
    python scrape_trustpilot_to_db.py impactguru.com 10      # domain, max pages

Requires: selenium + Chrome installed (already used by test_selenium.py),
          psycopg2-binary, and DATABASE_URL in .env.
"""
import os
import sys
import json
import time

# ---- config (override via CLI args) ---------------------------------------
DOMAIN = sys.argv[1] if len(sys.argv) > 1 else "impactguru.com"
MAX_PAGES = int(sys.argv[2]) if len(sys.argv) > 2 else 10
BASE = "https://www.trustpilot.com/review/{domain}?page={page}"


def load_env():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_path):
        parsed = {}
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    parsed[k.strip()] = v.strip().strip("'").strip('"')
        for k, v in parsed.items():
            os.environ.setdefault(k, v)


def ensure_deps():
    try:
        import psycopg2  # noqa
        import requests  # noqa
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary", "requests"])


def make_driver():
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1280,2000")
    # reduce "I'm a bot" signals so Trustpilot serves the real page, not the 403 block
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    )
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    driver = webdriver.Chrome(options=opts)
    return driver


def analyze_review(comment):
    api_key = os.environ.get("AZURE_OPENAI_API_KEY")
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    deployment_name = os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME")
    api_version = os.environ.get("AZURE_OPENAI_API_VERSION") or "2024-02-15-preview"
    
    default_res = {
        "priority": "P3",
        "next_action": "Assess review and route to appropriate department.",
        "department": "Support",
        "user_type": "Inquirer"
    }
    
    if not api_key or not endpoint or not deployment_name:
        return default_res
        
    system_prompt = (
        "You are an AI assistant that analyzes Trustpilot reviews. Analyze the provided review and extract the following information. "
        "You must respond strictly in valid JSON format with these exact keys: "
        "priority (Choose one: \"P0\", \"P1\", \"P2\", \"P3\", \"P4\", \"P5\") "
        "next_action (A brief description of what action needs to be taken next) "
        "department (The department that should handle this, e.g., Support, Sales, Marketing, HR) "
        "user_type (Categorize the user, e.g., \"Customer\", \"Donor\", \"Inquirer\") "
        "Do not include any conversational text, code blocks, or markdown formatting in your response. Return only the raw JSON object."
    )
    user_content = f"review: {comment or ''}"
    
    try:
        import requests
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
        res = requests.post(url, headers=headers, json=payload, timeout=10)
        if res.status_code != 200:
            return default_res
            
        data = res.json()
        content = data["choices"][0]["message"]["content"].strip()
        
        # Clean potential markdown wrappers
        if "```" in content:
            import re
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
        print(f"[DEBUG] LLM analysis error: {e}")
        return default_res


def extract_reviews(page_source):
    """Pull the reviews array out of the __NEXT_DATA__ JSON blob."""
    marker = '<script id="__NEXT_DATA__" type="application/json">'
    i = page_source.find(marker)
    if i == -1:
        return None  # blocked / different layout
    i += len(marker)
    j = page_source.find("</script>", i)
    data = json.loads(page_source[i:j])
    return (((data.get("props") or {}).get("pageProps") or {}).get("reviews")) or []


def norm(review):
    dates = review.get("dates") or {}
    consumer = review.get("consumer") or {}
    return {
        "review_id": str(review.get("id") or ""),
        "rating": int(review.get("rating") or 0) or None,
        "heading": (review.get("title") or "")[:1000],
        "author_name": (consumer.get("displayName") or "Anonymous")[:255],
        "comment": review.get("text") or "",
        "received_at": dates.get("publishedDate") or dates.get("experiencedDate"),
    }


def main():
    load_env()
    ensure_deps()
    import psycopg2

    db_url = (os.environ.get("DATABASE_URL") or "").split("?")[0]
    if not db_url:
        print("ERROR: DATABASE_URL not set in .env")
        sys.exit(1)

    conn = psycopg2.connect(db_url, sslmode="require")
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
        "SELECT id FROM channels WHERE organization_id = %s AND platform = 'trustpilot' LIMIT 1",
        (org_id,)
    )
    row = cur.fetchone()
    if row:
        channel_id = row[0]
    else:
        cur.execute(
            "INSERT INTO channels (organization_id, platform, external_id, display_name, status) VALUES (%s, 'trustpilot', 'trustpilot_legacy', 'Trustpilot', 'active') RETURNING id",
            (org_id,)
        )
        channel_id = cur.fetchone()[0]

    driver = make_driver()
    total_saved, total_seen = 0, 0
    try:
        for page in range(1, MAX_PAGES + 1):
            url = BASE.format(domain=DOMAIN, page=page)
            driver.get(url)
            time.sleep(2.5)  # let the page render
            reviews = extract_reviews(driver.page_source)

            if reviews is None:
                print(f"[page {page}] Could not read reviews (likely blocked / wrong domain). "
                      f"Title was: {driver.title!r}")
                break
            if not reviews:
                print(f"[page {page}] No more reviews. Stopping.")
                break

            for r in reviews:
                rec = norm(r)
                if not rec["review_id"]:
                    continue
                total_seen += 1

                # Analyze via LLM
                escalation = analyze_review(rec["comment"])

                platform_user_id = (rec["author_name"].lower().replace(" ", "_") + "_" + rec["review_id"])

                # Insert Contact
                cur.execute("""
                    INSERT INTO contacts (channel_id, platform_user_id, name)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (channel_id, platform_user_id) DO UPDATE SET updated_at = NOW()
                    RETURNING id
                """, (channel_id, platform_user_id, rec["author_name"]))
                contact_id = cur.fetchone()[0]

                # Insert Conversation
                cur.execute("""
                    INSERT INTO conversations (organization_id, channel_id, platform_thread_id, title, platform, type, status, priority, next_action, department, user_type, platform_created_at, created_at)
                    VALUES (%s, %s, %s, %s, 'trustpilot', 'Review', 'open', %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (channel_id, platform_thread_id) DO UPDATE SET
                        priority = EXCLUDED.priority,
                        next_action = EXCLUDED.next_action,
                        department = EXCLUDED.department,
                        user_type = EXCLUDED.user_type,
                        updated_at = NOW()
                    RETURNING id
                """, (org_id, channel_id, rec["review_id"], rec["heading"], escalation["priority"], escalation["next_action"], escalation["department"], escalation["user_type"], rec["received_at"]))
                conv_id = cur.fetchone()[0]

                # Insert Message
                cur.execute("""
                    INSERT INTO messages (conversation_id, contact_id, sender_type, visibility, content, platform_message_id, rating, status, platform_created_at, created_at)
                    VALUES (%s, %s, 'customer', 'public', %s, %s, %s, 'received', %s, NOW())
                    ON CONFLICT (conversation_id, platform_message_id) DO UPDATE SET
                        content = EXCLUDED.content,
                        rating = EXCLUDED.rating
                """, (conv_id, contact_id, rec["comment"], rec["review_id"], rec["rating"], rec["received_at"]))
                
                saved_count = cur.rowcount
                if saved_count > 0:
                    total_saved += 1

            print(f"[page {page}] {len(reviews)} reviews processed.")
    finally:
        driver.quit()

    cur.execute("SELECT COUNT(*) FROM conversations WHERE platform='trustpilot'")
    print(f"\nDone. Scraped {total_seen} reviews; upserted {total_saved}. "
          f"trustpilot conversations now has {cur.fetchone()[0]} rows.")
    conn.close()

if __name__ == "__main__":
    main()
