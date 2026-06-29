import os
import sys
import json
import urllib.request
import subprocess

# Ensure psycopg2 is installed
try:
    import psycopg2
except ImportError:
    print("psycopg2 is not installed. Installing psycopg2-binary...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary"])
    import psycopg2

def load_env():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    os.environ[key.strip()] = val.strip().strip("'").strip('"')

def main():
    load_env()
    
    db_url = os.environ.get('DATABASE_URL')
    
    if not db_url or "aws.neon.tech" in db_url:
        print("\n" + "="*60)
        print("We need your full Aiven PostgreSQL Connection URI.")
        print("It should look like this:")
        print("postgres://avnadmin:YOUR_PASSWORD@pg-3bd0d975-impactguru-494d.e.aivencloud.com:26760/defaultdb?sslmode=require")
        print("="*60 + "\n")
        
        db_url = input("Please paste your FULL Aiven connection string (DATABASE_URL): ").strip()
        
        if not db_url.startswith("postgres://") and not db_url.startswith("postgresql://"):
            print("\nERROR: That doesn't look like a valid connection string!")
            print("You pasted a hostname. You need to copy the full 'Service URI' from your Aiven Console.")
            sys.exit(1)
            
    # Strip ?sslmode=... if present, psycopg2 handles sslmode directly
    if '?' in db_url:
        db_url = db_url.split('?')[0]

    print("Connecting to Aiven database...")
    try:
        conn = psycopg2.connect(db_url, sslmode='require')
        cursor = conn.cursor()
    except Exception as e:
        print(f"Database connection failed: {e}")
        sys.exit(1)

    print("Ensuring trustpilot_reviews table matches db.js schema...")
    
    # Ensure connected_channels exists (it should, but just in case)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS connected_channels (
      id            SERIAL PRIMARY KEY,
      platform      VARCHAR(50) NOT NULL,
      account_email VARCHAR(255),
      account_name  VARCHAR(255),
      avatar_url    VARCHAR(512),
      access_token  TEXT,
      status        VARCHAR(50) DEFAULT 'active',
      connected_at  TIMESTAMP DEFAULT NOW(),
      updated_at    TIMESTAMP DEFAULT NOW(),
      UNIQUE(platform, account_email)
    );
    """)

    # Create trustpilot_reviews with the exact structure from db.js
    create_table_query = """
    CREATE TABLE IF NOT EXISTS trustpilot_reviews (
      id                SERIAL PRIMARY KEY,
      channel_id        INTEGER REFERENCES connected_channels(id),
      review_id         VARCHAR(255) UNIQUE,
      rating            INTEGER,
      heading           VARCHAR(1000),
      author_name       VARCHAR(255),
      author_avatar     VARCHAR(512),
      comment           TEXT,
      received_at       TIMESTAMP,
      status            VARCHAR(50) DEFAULT 'open',
      is_read           BOOLEAN DEFAULT FALSE,
      created_at        TIMESTAMP DEFAULT NOW()
    );
    """
    cursor.execute(create_table_query)
    conn.commit()

    print("Fetching Trustpilot reviews from local server...")
    try:
        req = urllib.request.Request('http://localhost:8080/api/trustpilot-reviews')
        res = urllib.request.urlopen(req)
        result = json.loads(res.read().decode('utf-8'))
        
        if not result.get('success') or not result.get('data'):
            raise Exception("Invalid response format from server")
            
        reviews = result['data']
        print(f"Fetched {len(reviews)} reviews. Seeding into database...")

    except Exception as e:
        print(f"Failed to fetch reviews from server: {e}")
        print("Please make sure your server.py is running and you have synced Trustpilot reviews at least once.")
        sys.exit(1)

    # Ensure a Trustpilot channel exists in connected_channels
    cursor.execute("SELECT id FROM connected_channels WHERE platform='trustpilot' LIMIT 1")
    row = cursor.fetchone()
    if row:
        channel_id = row[0]
    else:
        cursor.execute("INSERT INTO connected_channels (platform, account_name) VALUES ('trustpilot', 'Trustpilot') RETURNING id")
        channel_id = cursor.fetchone()[0]
        conn.commit()

    inserted_count = 0
    
    insert_query = """
        INSERT INTO trustpilot_reviews (channel_id, review_id, rating, heading, author_name, comment, received_at)
        VALUES (%s, %s, %s, %s, %s, %s, NOW())
        ON CONFLICT (review_id) DO NOTHING
    """
    
    for review in reviews:
        # Clean up rating to integer
        rating_val = 5
        try:
            r = review.get('rating')
            if r and r != 'N/A':
                rating_val = int(r)
        except:
            pass

        try:
            cursor.execute(insert_query, (
                channel_id,
                review.get('review_id'),
                rating_val,
                str(review.get('heading', 'N/A'))[:1000],
                str(review.get('author_name', 'Anonymous'))[:255],
                review.get('comment', '')
            ))
            if cursor.rowcount > 0:
                inserted_count += 1
        except Exception as e:
            print(f"Error inserting review {review.get('review_id')}: {e}")
            conn.rollback()
            continue
            
    conn.commit()
    cursor.close()
    conn.close()

    print(f"Successfully inserted {inserted_count} new reviews into 'trustpilot_reviews' table!")

if __name__ == "__main__":
    main()
