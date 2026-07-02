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
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip("'").strip('"'))


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

    # make sure the table can accept our rows (self-healing, matches api/_lib/db.js)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS trustpilot_reviews (
            id SERIAL PRIMARY KEY, channel_id INTEGER, review_id VARCHAR(255) UNIQUE,
            rating INTEGER, heading TEXT, author_name VARCHAR(255), comment TEXT,
            received_at TIMESTAMP, status VARCHAR(50) DEFAULT 'open',
            priority VARCHAR(50), next_action TEXT, department VARCHAR(100), user_type VARCHAR(100),
            created_at TIMESTAMP DEFAULT NOW());
    """)
    cur.execute("ALTER TABLE trustpilot_reviews ADD COLUMN IF NOT EXISTS channel_id INTEGER;")
    cur.execute("ALTER TABLE trustpilot_reviews ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'open';")
    cur.execute("ALTER TABLE trustpilot_reviews ADD COLUMN IF NOT EXISTS priority VARCHAR(50);")
    cur.execute("ALTER TABLE trustpilot_reviews ADD COLUMN IF NOT EXISTS next_action TEXT;")
    cur.execute("ALTER TABLE trustpilot_reviews ADD COLUMN IF NOT EXISTS department VARCHAR(100);")
    cur.execute("ALTER TABLE trustpilot_reviews ADD COLUMN IF NOT EXISTS user_type VARCHAR(100);")

    cur.execute("SELECT id FROM connected_channels WHERE platform='trustpilot' LIMIT 1")
    row = cur.fetchone()
    if row:
        channel_id = row[0]
    else:
        cur.execute("INSERT INTO connected_channels (platform, account_name) VALUES ('trustpilot','Trustpilot') RETURNING id")
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

                cur.execute("""
                    INSERT INTO trustpilot_reviews
                        (channel_id, review_id, rating, heading, author_name, comment, received_at, status, priority, next_action, department, user_type, created_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,'open',%s,%s,%s,%s,NOW())
                    ON CONFLICT (review_id) DO UPDATE SET
                        rating=EXCLUDED.rating, heading=EXCLUDED.heading,
                        author_name=EXCLUDED.author_name, comment=EXCLUDED.comment,
                        received_at=EXCLUDED.received_at,
                        priority=EXCLUDED.priority, next_action=EXCLUDED.next_action,
                        department=EXCLUDED.department, user_type=EXCLUDED.user_type
                """, (channel_id, rec["review_id"], rec["rating"], rec["heading"],
                      rec["author_name"], rec["comment"], rec["received_at"],
                      escalation["priority"], escalation["next_action"],
                      escalation["department"], escalation["user_type"]))
                if cur.rowcount > 0:
                    total_saved += 1
            print(f"[page {page}] {len(reviews)} reviews processed.")
    finally:
        driver.quit()

    cur.execute("SELECT COUNT(*) FROM trustpilot_reviews")
    print(f"\nDone. Scraped {total_seen} reviews; upserted {total_saved}. "
          f"trustpilot_reviews now has {cur.fetchone()[0]} rows.")
    conn.close()


if __name__ == "__main__":
    main()
