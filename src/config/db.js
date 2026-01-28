require('dotenv').config();
const { Pool } = require('pg');
const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL;

let poolConfig;

if (isProduction) {
    poolConfig = {
        connectionString: process.env.DATABASE_URL, 
        ssl: {
            rejectUnauthorized: false 
        }
    };
} else {
    poolConfig = {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        ssl: false 
    };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

pool.on('connect', () => {
    console.log(isProduction ? '✅ Connected to LIVE Render Database' : '✅ Connected to LOCAL Database');
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool,
};