const { Client } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');

const envConfig = dotenv.parse(fs.readFileSync('.env'));
const dbUrl = envConfig.DATABASE_URL;

async function checkDb() {
    const client = new Client({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    
    try {
        const res = await client.query('SELECT COUNT(*) FROM trustpilot_reviews');
        console.log(`Neon DB trustpilot_reviews count: ${res.rows[0].count}`);
    } catch (e) {
        console.log('Error querying Neon DB:', e.message);
    }
    
    await client.end();
}

checkDb();
