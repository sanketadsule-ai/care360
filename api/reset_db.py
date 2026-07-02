import os
import sys
import hashlib
import psycopg2

def load_env():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip("'").strip('"'))

def main():
    load_env()
    
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        db_url = "postgres://default:A6jPoxKqIe8c@ep-holy-snow-a1bshx41-pooler.ap-southeast-1.aws.neon.tech:5432/verceldb?sslmode=require"
        print(f"DATABASE_URL not set in .env. Using fallback: {db_url}")
        
    # Clean query parameters from URL
    db_url_clean = db_url.split("?")[0]
    
    print("Connecting to Neon database...")
    try:
        conn = psycopg2.connect(db_url_clean, sslmode="require")
        conn.autocommit = True
        cur = conn.cursor()
    except Exception as e:
        print(f"Failed to connect to database: {e}")
        sys.exit(1)

    print("Dropping ALL existing tables in public schema...")
    try:
        cur.execute("""
            DO $$ DECLARE
                r RECORD;
            BEGIN
                FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema()) LOOP
                    EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
                END LOOP;
            END $$;
        """)
        print("All tables dropped successfully.")
    except Exception as e:
        print(f"Failed to drop tables: {e}")
        conn.close()
        sys.exit(1)

    print("Reinitializing database with the new unified omnichannel schema...")
    
    ddl = """
    -- Extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";

    -- 1. ORGANIZATIONS
    CREATE TABLE IF NOT EXISTS organizations (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(255) NOT NULL,
        slug        VARCHAR(100) NOT NULL UNIQUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 2. USERS
    CREATE TABLE IF NOT EXISTS users (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id),
        email           VARCHAR(255) NOT NULL UNIQUE,
        name            VARCHAR(255) NOT NULL,
        initials        VARCHAR(10),
        avatar_url      VARCHAR(512),
        role            VARCHAR(50) NOT NULL DEFAULT 'user',
        status          VARCHAR(50) NOT NULL DEFAULT 'pending',
        password_hash   VARCHAR(255),
        salt            VARCHAR(255),
        provider        VARCHAR(50) DEFAULT 'email',
        google_id       VARCHAR(255),
        last_login      TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ,
        CONSTRAINT chk_users_role   CHECK (role   IN ('admin', 'user')),
        CONSTRAINT chk_users_status CHECK (status IN ('pending', 'approved', 'rejected', 'disabled'))
    );

    -- 3. RBAC
    CREATE TABLE IF NOT EXISTS roles (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id),
        name            VARCHAR(100) NOT NULL,
        description     TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (organization_id, name)
    );
    CREATE TABLE IF NOT EXISTS permissions (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action     VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_roles (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, role_id)
    );
    CREATE TABLE IF NOT EXISTS role_permissions (
        role_id       UUID NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
        permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
    );

    -- 4. TEAMS
    CREATE TABLE IF NOT EXISTS teams (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (organization_id, name)
    );
    CREATE TABLE IF NOT EXISTS team_members (
        team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (team_id, user_id)
    );

    -- 5. CHANNELS
    CREATE TABLE IF NOT EXISTS channels (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id),
        platform        VARCHAR(50) NOT NULL,
        external_id     VARCHAR(255) NOT NULL,
        display_name    VARCHAR(255),
        handle          VARCHAR(255),
        avatar_url      VARCHAR(512),
        account_id      VARCHAR(255),
        status          VARCHAR(50) NOT NULL DEFAULT 'active',
        connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ,
        CONSTRAINT chk_channel_status CHECK (status IN ('active', 'error', 'disconnected')),
        UNIQUE (organization_id, platform, external_id)
    );

    CREATE TABLE IF NOT EXISTS channel_credentials (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id      UUID NOT NULL UNIQUE REFERENCES channels(id) ON DELETE CASCADE,
        credential_type VARCHAR(50) NOT NULL DEFAULT 'oauth_token',
        encrypted_value TEXT NOT NULL,
        refresh_token   TEXT,
        expires_at      TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_cred_type CHECK (credential_type IN ('oauth_token', 'api_key', 'webhook_secret'))
    );

    -- 6. PLATFORM INTEGRATIONS
    CREATE TABLE IF NOT EXISTS platform_integrations (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id),
        channel_id      UUID REFERENCES channels(id),
        provider        VARCHAR(100) NOT NULL,
        status          VARCHAR(50) NOT NULL DEFAULT 'active',
        last_sync       TIMESTAMPTZ,
        last_error      TEXT,
        settings        JSONB DEFAULT '{}',
        webhook_secret  VARCHAR(255),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 7. CUSTOMERS + CONTACTS
    CREATE TABLE IF NOT EXISTS customers (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id),
        name            VARCHAR(255),
        email           VARCHAR(255),
        avatar_url      VARCHAR(512),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS contacts (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id      UUID REFERENCES customers(id),
        channel_id       UUID NOT NULL REFERENCES channels(id),
        platform_user_id VARCHAR(255) NOT NULL,
        name             VARCHAR(255),
        username         VARCHAR(255),
        email            VARCHAR(255),
        avatar_url       VARCHAR(512),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at       TIMESTAMPTZ,
        UNIQUE (channel_id, platform_user_id)
    );

    -- 8. TAGS
    CREATE TABLE IF NOT EXISTS tags (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id),
        name            VARCHAR(100) NOT NULL,
        color           VARCHAR(7),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (organization_id, name)
    );

    -- 9. CONVERSATIONS
    CREATE TABLE IF NOT EXISTS conversations (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id     UUID NOT NULL REFERENCES organizations(id),
        channel_id          UUID NOT NULL REFERENCES channels(id),
        assigned_to         UUID REFERENCES users(id),
        assigned_to_team_id UUID REFERENCES teams(id),
        platform_thread_id  VARCHAR(255) NOT NULL,
        title               VARCHAR(1000),
        platform            VARCHAR(50) NOT NULL,
        type                VARCHAR(50),
        status              VARCHAR(50) NOT NULL DEFAULT 'open',
        priority            VARCHAR(10),
        department          VARCHAR(100),
        user_type           VARCHAR(100),
        next_action         TEXT,
        sentiment           VARCHAR(50) DEFAULT 'unset',
        source_url          VARCHAR(1024),
        platform_created_at TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at          TIMESTAMPTZ,
        CONSTRAINT chk_conv_status    CHECK (status    IN ('open','pending','snoozed','resolved','closed')),
        CONSTRAINT chk_conv_priority  CHECK (priority  IS NULL OR priority IN ('P0','P1','P2','P3','P4','P5')),
        CONSTRAINT chk_conv_sentiment CHECK (sentiment IN ('positive','negative','neutral','unset')),
        UNIQUE (channel_id, platform_thread_id)
    );

    CREATE TABLE IF NOT EXISTS conversation_tags (
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        tag_id          UUID NOT NULL REFERENCES tags(id)          ON DELETE CASCADE,
        PRIMARY KEY (conversation_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS conversation_participants (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        contact_id      UUID NOT NULL REFERENCES contacts(id),
        role            VARCHAR(20) NOT NULL DEFAULT 'sender',
        joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_participant_role CHECK (role IN ('sender','recipient','cc','bcc','agent'))
    );

    -- 10. MESSAGES
    CREATE TABLE IF NOT EXISTS messages (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        contact_id          UUID REFERENCES contacts(id),
        author_id           UUID REFERENCES users(id),
        sender_type         VARCHAR(20) NOT NULL DEFAULT 'customer',
        visibility          VARCHAR(20) NOT NULL DEFAULT 'public',
        content             TEXT,
        content_html        TEXT,
        platform_message_id VARCHAR(255),
        rating              SMALLINT,
        status              VARCHAR(20) NOT NULL DEFAULT 'received',
        metadata            JSONB DEFAULT '{}',
        metadata_version    SMALLINT NOT NULL DEFAULT 1,
        gmail_labels        TEXT[] GENERATED ALWAYS AS (
            CASE
                WHEN metadata ? 'labels'
                THEN ARRAY(SELECT jsonb_array_elements_text(metadata->'labels'))
            END
        ) STORED,
        platform_created_at TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at          TIMESTAMPTZ,
        CONSTRAINT chk_msg_sender     CHECK (sender_type IN ('customer','agent','system')),
        CONSTRAINT chk_msg_visibility CHECK (visibility  IN ('public','internal','private')),
        CONSTRAINT chk_msg_status     CHECK (status      IN ('received','queued','sent','delivered','read','failed')),
        CONSTRAINT chk_msg_rating     CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
        UNIQUE (conversation_id, platform_message_id)
    );

    -- 11. ATTACHMENTS
    CREATE TABLE IF NOT EXISTS attachments (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id        UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        url               VARCHAR(1024) NOT NULL,
        mime_type         VARCHAR(100),
        size_bytes        BIGINT,
        filename          VARCHAR(255),
        storage_provider  VARCHAR(50) DEFAULT 'local',
        bucket            VARCHAR(255),
        object_key        VARCHAR(512),
        checksum          VARCHAR(64),
        virus_scan_status VARCHAR(20) DEFAULT 'pending',
        thumbnail_url     VARCHAR(1024),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at        TIMESTAMPTZ,
        CONSTRAINT chk_attachment_scan CHECK (virus_scan_status IN ('pending','clean','infected','skipped'))
    );

    -- 12. ACTIVITIES
    CREATE TABLE IF NOT EXISTS activities (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id         UUID REFERENCES users(id),
        action          VARCHAR(100) NOT NULL,
        old_value       TEXT,
        new_value       TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_activity_action CHECK (action IN (
            'assigned','unassigned','status_changed','priority_changed',
            'department_changed','replied','closed','reopened',
            'tagged','untagged','sla_breached','note_added'
        ))
    );

    -- 13. AI RUNS
    CREATE TABLE IF NOT EXISTS ai_runs (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id      UUID NOT NULL REFERENCES conversations(id),
        message_id           UUID REFERENCES messages(id),
        model                VARCHAR(100),
        provider             VARCHAR(50) DEFAULT 'azure_openai',
        prompt               TEXT,
        response             TEXT,
        prompt_storage_url   VARCHAR(1024),
        response_storage_url VARCHAR(1024),
        tokens_input         INT,
        tokens_output        INT,
        latency_ms           INT,
        cost                 NUMERIC(10,6),
        status               VARCHAR(20) NOT NULL DEFAULT 'success',
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_ai_status CHECK (status IN ('success','failed','timeout'))
    );

    -- 14. SLA
    CREATE TABLE IF NOT EXISTS sla_policies (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id      UUID NOT NULL REFERENCES organizations(id),
        priority             VARCHAR(10) NOT NULL,
        first_response_mins  INT NOT NULL DEFAULT 60,
        resolution_time_mins INT NOT NULL DEFAULT 1440,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (organization_id, priority),
        CONSTRAINT chk_sla_priority CHECK (priority IN ('P0','P1','P2','P3','P4','P5'))
    );

    CREATE TABLE IF NOT EXISTS conversation_sla (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id         UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
        sla_policy_id           UUID REFERENCES sla_policies(id),
        first_response_due_at   TIMESTAMPTZ,
        first_response_breached BOOLEAN NOT NULL DEFAULT FALSE,
        resolution_due_at       TIMESTAMPTZ,
        resolution_breached     BOOLEAN NOT NULL DEFAULT FALSE,
        resolved_at             TIMESTAMPTZ
    );

    -- 15. CSAT
    CREATE TABLE IF NOT EXISTS conversation_feedback (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
        rating          SMALLINT NOT NULL,
        comment         TEXT,
        submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_feedback_rating CHECK (rating >= 1 AND rating <= 5)
    );

    -- 16. SETTINGS
    CREATE TABLE IF NOT EXISTS settings (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key        VARCHAR(255) NOT NULL,
        value      JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, key)
    );

    -- 17. NOTIFICATIONS
    CREATE TABLE IF NOT EXISTS notifications (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type              VARCHAR(100) NOT NULL,
        entity            VARCHAR(50),
        entity_id         UUID,
        payload           JSONB DEFAULT '{}',
        delivery_channel  VARCHAR(20) DEFAULT 'in_app',
        delivered_at      TIMESTAMPTZ,
        read_at           TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_notif_delivery CHECK (delivery_channel IN ('in_app','email','push','sms'))
    );

    -- 18. OBSERVABILITY
    CREATE TABLE IF NOT EXISTS job_runs (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_name       VARCHAR(100) NOT NULL,
        channel_id     UUID REFERENCES channels(id),
        status         VARCHAR(20) NOT NULL DEFAULT 'running',
        records_synced INT DEFAULT 0,
        error_log      TEXT,
        started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at   TIMESTAMPTZ,
        CONSTRAINT chk_job_status CHECK (status IN ('running','success','failed','partial'))
    );

    CREATE TABLE IF NOT EXISTS webhook_logs (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        platform    VARCHAR(50),
        channel_id  UUID REFERENCES channels(id),
        payload_raw TEXT,
        http_status SMALLINT,
        error       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """
    
    indexes = """
    CREATE INDEX IF NOT EXISTS idx_conv_org_updated   ON conversations (organization_id, updated_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_conv_channel       ON conversations (channel_id);
    CREATE INDEX IF NOT EXISTS idx_conv_assigned_user ON conversations (assigned_to)         WHERE assigned_to IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_conv_assigned_team ON conversations (assigned_to_team_id) WHERE assigned_to_team_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_conv_status        ON conversations (organization_id, status);
    CREATE INDEX IF NOT EXISTS idx_conv_priority      ON conversations (organization_id, priority);

    CREATE INDEX IF NOT EXISTS idx_msg_conversation   ON messages (conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_msg_contact        ON messages (contact_id)  WHERE contact_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_msg_author         ON messages (author_id)   WHERE author_id  IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_msg_visibility     ON messages (conversation_id, visibility);
    CREATE INDEX IF NOT EXISTS idx_msg_fts            ON messages USING GIN (to_tsvector('english', coalesce(content, '')));
    CREATE INDEX IF NOT EXISTS idx_msg_trgm           ON messages USING GIN (content gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_msg_gmail_labels   ON messages USING GIN (gmail_labels) WHERE gmail_labels IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_contacts_customer  ON contacts (customer_id) WHERE customer_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_sla_due_unbreached ON conversation_sla (resolution_due_at) WHERE resolution_breached = FALSE;
    CREATE INDEX IF NOT EXISTS idx_notif_user_unread  ON notifications (recipient_user_id, created_at DESC) WHERE read_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_activities_conv    ON activities (conversation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_runs_conv       ON ai_runs (conversation_id);
    CREATE INDEX IF NOT EXISTS idx_job_runs_name      ON job_runs (job_name, started_at DESC);
    """
    
    rls = """
    ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
    ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS org_isolation_conversations ON conversations;
    DROP POLICY IF EXISTS org_isolation_messages ON messages;
    DROP POLICY IF EXISTS org_isolation_contacts ON contacts;
    DROP POLICY IF EXISTS org_isolation_customers ON customers;
    DROP POLICY IF EXISTS org_isolation_channels ON channels;

    CREATE POLICY org_isolation_conversations ON conversations
        USING (
           current_setting('app.current_org_id', TRUE) IS NULL 
           OR current_setting('app.current_org_id', TRUE) = '' 
           OR organization_id = current_setting('app.current_org_id', TRUE)::uuid
        );
    
    CREATE POLICY org_isolation_messages ON messages
        USING (
           current_setting('app.current_org_id', TRUE) IS NULL 
           OR current_setting('app.current_org_id', TRUE) = '' 
           OR (SELECT organization_id FROM conversations WHERE conversations.id = messages.conversation_id) = current_setting('app.current_org_id', TRUE)::uuid
        );

    CREATE POLICY org_isolation_contacts ON contacts
        USING (
           current_setting('app.current_org_id', TRUE) IS NULL 
           OR current_setting('app.current_org_id', TRUE) = '' 
           OR (SELECT organization_id FROM channels WHERE channels.id = contacts.channel_id) = current_setting('app.current_org_id', TRUE)::uuid
        );

    CREATE POLICY org_isolation_customers ON customers
        USING (
           current_setting('app.current_org_id', TRUE) IS NULL 
           OR current_setting('app.current_org_id', TRUE) = '' 
           OR organization_id = current_setting('app.current_org_id', TRUE)::uuid
        );
        
    CREATE POLICY org_isolation_channels ON channels
        USING (
           current_setting('app.current_org_id', TRUE) IS NULL 
           OR current_setting('app.current_org_id', TRUE) = '' 
           OR organization_id = current_setting('app.current_org_id', TRUE)::uuid
        );
    """

    try:
        print("Executing DDL...")
        cur.execute(ddl)
        print("Executing Indexes...")
        cur.execute(indexes)
        print("Executing RLS policies...")
        cur.execute(rls)
        
        # Seed Organization
        print("Seeding Carepal360 organization...")
        cur.execute("""
            INSERT INTO organizations (name, slug)
            VALUES ('Carepal360', 'carepal360')
            ON CONFLICT (slug) DO NOTHING
            RETURNING id
        """)
        org_row = cur.fetchone()
        
        # Fetch organization id if it already existed
        if not org_row:
            cur.execute("SELECT id FROM organizations WHERE slug = 'carepal360'")
            org_id = cur.fetchone()[0]
        else:
            org_id = org_row[0]
            
        # Seed Administrator
        print("Seeding initial administrator account...")
        admin_email = 'admin@carepal360.com'
        admin_pass = 'Admin@12345'
        admin_name = 'Administrator'
        salt = os.urandom(16).hex()
        
        # Pbkdf2 SHA512 hash matched with JS pbkdf2Sync
        hashed = hashlib.pbkdf2_hmac('sha512', admin_pass.encode('utf-8'), salt.encode('utf-8'), 10000, 64).hex()
        initials = admin_name[:2].upper()
        
        cur.execute("""
            INSERT INTO users (organization_id, email, name, initials, role, status, provider, password_hash, salt, updated_at)
            VALUES (%s, %s, %s, %s, 'admin', 'approved', 'email', %s, %s, NOW())
            ON CONFLICT (email) DO NOTHING
        """, (org_id, admin_email, admin_name, initials, hashed, salt))

        print("Database reinitialization complete successfully!")
    except Exception as e:
        print(f"Error executing schema: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
