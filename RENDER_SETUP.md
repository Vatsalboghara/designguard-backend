# Render Deployment Setup Guide

## 🚨 Database Schema Issue Fix

Your Render database is missing the `password_hash` column in the `users` table. Follow these steps to fix it:

## Step 1: Run Migration on Render

### Option A: Automatic Migration (Recommended)
1. **Push the updated code to your Git repository**
2. **Render will automatically run the migration** during deployment via `postinstall` script

### Option B: Manual Migration
1. Go to your Render dashboard
2. Open your backend service
3. Go to "Shell" tab
4. Run the following command:
   ```bash
   npm run migrate
   ```

## Step 2: Verify Database Schema

After migration, check if the tables are created properly:

```sql
-- Check if users table has password_hash column
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'password_hash';

-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

## Step 3: Environment Variables

Make sure these environment variables are set in Render:

```
DATABASE_URL=your_postgres_connection_string
JWT_SECRET=your_jwt_secret_key
NODE_ENV=production
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
```

## Step 4: Test the Fix

1. **Deploy the updated code**
2. **Check server logs** for migration success
3. **Test user registration** from your app
4. **Test user login** from your app

## Expected Database Tables

After successful migration, you should have these tables:
- ✅ users (with password_hash column)
- ✅ factory_profiles
- ✅ vepari_profiles
- ✅ designs
- ✅ access_requests
- ✅ orders
- ✅ chat_rooms
- ✅ messages
- ✅ notifications

## Troubleshooting

### If migration fails:
1. Check Render logs for specific error messages
2. Verify DATABASE_URL is correct
3. Ensure PostgreSQL database is properly connected
4. Try running migration manually via Render Shell

### If users table exists but missing password_hash:
```sql
-- Add password_hash column manually
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
```

### If you need to reset the database:
```sql
-- ⚠️ WARNING: This will delete all data
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
-- Then run migration again
```

## Files Modified:
- ✅ `database_schema.sql` - Complete database schema
- ✅ `migrate.js` - Migration script
- ✅ `package.json` - Added migration scripts
- ✅ `src/server.js` - Added schema validation

## Next Steps:
1. Push code to Git repository
2. Wait for Render deployment
3. Check deployment logs
4. Test app functionality