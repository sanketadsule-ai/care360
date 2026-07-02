const dotenv = require('dotenv');
const fs = require('fs');

const envConfig = dotenv.parse(fs.readFileSync('.env'));
console.log('dotenv.parse result:', envConfig.DATABASE_URL);

dotenv.config();
console.log('process.env.DATABASE_URL:', process.env.DATABASE_URL);
