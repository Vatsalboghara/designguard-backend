require('dotenv').config();
const { Pool } = require('pg');

// Check: શું આપણે Render પર છીએ? (જો DATABASE_URL હોય તો)
const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL;

let poolConfig;

if (isProduction) {
    // --- LIVE SETTINGS (Render માટે) ---
    poolConfig = {
        connectionString: process.env.DATABASE_URL, // આ લિંક Render Environment માંથી આવશે
        ssl: {
            rejectUnauthorized: false // આ લાઈન વગર Render પર કનેક્ટ ન થાય
        }
    };
} else {
    // --- LOCAL SETTINGS (તમારા લેપટોપ માટે) ---
    poolConfig = {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// ખાલી જાણકારી માટે (તમે કન્સોલમાં જોઈ શકશો કે કનેક્ટ થયું કે નહીં)
pool.on('connect', () => {
    console.log(isProduction ? '✅ Connected to LIVE Render Database' : '✅ Connected to LOCAL Database');
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool,
};