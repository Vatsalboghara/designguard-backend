-- Manual Migration SQL Commands
-- Run these commands directly in your Render PostgreSQL database if automatic migration fails

-- Step 1: Add password_hash column to existing users table (if it exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Step 2: Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    mobile_number VARCHAR(20) UNIQUE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('vepari', 'factory_owner')),
    is_verified BOOLEAN DEFAULT FALSE,
    otp_code VARCHAR(10),
    otp_expires_at TIMESTAMP,
    profile_picture_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 3: Create other essential tables
CREATE TABLE IF NOT EXISTS factory_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    gst_number VARCHAR(50),
    factory_address TEXT,
    logo_url TEXT,
    employee_count INTEGER,
    established_year INTEGER,
    bio TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vepari_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    vepari_brand_name VARCHAR(255) NOT NULL,
    city VARCHAR(255) NOT NULL,
    vepari_gst_number VARCHAR(50),
    business_type VARCHAR(100),
    logo_url TEXT,
    established_year INTEGER,
    bio TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS designs (
    id SERIAL PRIMARY KEY,
    factory_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    design_number VARCHAR(100) NOT NULL,
    image_url TEXT NOT NULL,
    color_variants TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS access_requests (
    id SERIAL PRIMARY KEY,
    vepari_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    factory_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(vepari_id, factory_id)
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    vepari_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    factory_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    design_id INTEGER REFERENCES designs(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    printing_note TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_production', 'completed', 'cancelled')),
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_rooms (
    id SERIAL PRIMARY KEY,
    vepari_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    factory_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    last_message TEXT,
    last_message_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(vepari_id, factory_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_designs_factory_id ON designs(factory_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_vepari_factory ON chat_rooms(vepari_id, factory_id);
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);

-- Step 5: Verify the migration
SELECT 'users' as table_name, count(*) as row_count FROM users
UNION ALL
SELECT 'factory_profiles', count(*) FROM factory_profiles
UNION ALL
SELECT 'vepari_profiles', count(*) FROM vepari_profiles
UNION ALL
SELECT 'designs', count(*) FROM designs
UNION ALL
SELECT 'access_requests', count(*) FROM access_requests
UNION ALL
SELECT 'orders', count(*) FROM orders
UNION ALL
SELECT 'chat_rooms', count(*) FROM chat_rooms
UNION ALL
SELECT 'messages', count(*) FROM messages
UNION ALL
SELECT 'notifications', count(*) FROM notifications;