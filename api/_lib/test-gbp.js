const { getPool, ensureTables } = require('./db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  try {
    await ensureTables();
    const pool = getPool();

    const channelRes = await pool.query("SELECT id, access_token FROM connected_channels WHERE platform = 'google_business' ORDER BY created_at DESC LIMIT 1");
    if (channelRes.rows.length === 0) {
      return res.status(200).json({ error: "No google_business channel found in DB." });
    }
    
    const token = channelRes.rows[0].access_token;
    let output = {};
    output.channelId = channelRes.rows[0].id;

    const accRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    output.accountsStatus = accRes.status;
    const accText = await accRes.text();
    output.accountsResponse = accText;
    
    let accData;
    try { accData = JSON.parse(accText); } catch(e){}

    if (accData && accData.accounts && accData.accounts.length > 0) {
      const accName = accData.accounts[0].name;
      
      const locRes = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${accName}/locations?readMask=name,title`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      output.locationsStatus = locRes.status;
      output.locationsResponse = await locRes.text();
    }

    return res.status(200).json(output);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
