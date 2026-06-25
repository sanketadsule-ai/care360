require('dotenv').config();
const { Pool } = require('pg');

let connString = process.env.DATABASE_URL || 'postgres://default:A6jPoxKqIe8c@ep-holy-snow-a1bshx41-pooler.ap-southeast-1.aws.neon.tech:5432/verceldb?sslmode=require';
if (connString.includes('?')) {
  connString = connString.split('?')[0];
}

const pool = new Pool({
  connectionString: connString,
  ssl: { rejectUnauthorized: false }
});

async function checkApi() {
  try {
    const channelRes = await pool.query("SELECT id, access_token FROM connected_channels WHERE platform = 'google_business' ORDER BY created_at DESC LIMIT 1");
    if (channelRes.rows.length === 0) {
      console.log("No google_business channel found in DB.");
      process.exit(1);
    }
    
    const token = channelRes.rows[0].access_token;
    console.log(`Testing token from channel ${channelRes.rows[0].id}...`);

    console.log("--- Fetching Accounts ---");
    const accRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const accStatus = accRes.status;
    const accText = await accRes.text();
    console.log(`Accounts Status: ${accStatus}`);
    console.log(`Accounts Response: ${accText}`);
    
    let accData;
    try { accData = JSON.parse(accText); } catch(e){}

    if (accData && accData.accounts && accData.accounts.length > 0) {
      const accName = accData.accounts[0].name;
      console.log(`--- Fetching Locations for ${accName} ---`);
      
      const locRes = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${accName}/locations?readMask=name,title`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const locStatus = locRes.status;
      const locText = await locRes.text();
      console.log(`Locations Status: ${locStatus}`);
      console.log(`Locations Response: ${locText}`);
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    pool.end();
  }
}

checkApi();
