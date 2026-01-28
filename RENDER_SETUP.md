# Render Deployment Setup Guide

## 🚨 Database Schema Issue Fix

Your Render database is missing the `password_hash` column in the `users` table. Follow these steps to fix it:

## Step 1: Automatic Migration (Recommended)

The server now automatically runs migration on startup. Just deploy the updated code:

1. **Push the updated code to your Git repository**
2. **Render will automatically deploy**
3. **Server will auto-migrate database on startup**
4. **Check deployment logs for migration success**

## Step 2: Manual Migration (If Automatic Fails)

If automatic migration fails, run manual commands:

### Option A: Using Render Shell
1. Go to your Render dashboard
2. Open your backend service
3. Go to "Shell" tab
4. Run: `npm run migrate`

### Option B: Direct SQL Commands
1. Go to your Render dashboard
2. Open your PostgreSQL database
3. Go to "Query" tab
4. Copy and paste commands from `manual_migration.sql`
5. Execute the SQL commands

## Step 3: Verify Database Schema

Check if the migration was successful:

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

## Step 4: Environment Variables

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

## Step 5: Test the Fix

1. **Check deployment logs** for these messages:
   ```
   ✅ Database Connected Successfully
   ✅ Database schema is up to date
   🚀 Server started on port 5000
   ```

2. **Test user registration** from your app
3. **Test user login** from your app

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

### If deployment fails with migration error:
1. **Remove postinstall script** (already done)
2. **Server will auto-migrate on startup**
3. **Check server logs for migration status**

### If automatic migration fails:
1. **Use manual SQL commands** from `manual_migration.sql`
2. **Run commands directly in Render PostgreSQL Query tab**
3. **Restart your service after manual migration**

### If users table exists but missing password_hash:
```sql
-- Add password_hash column manually
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
```

### Emergency: Reset database completely
```sql
-- ⚠️ WARNING: This will delete all data
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
-- Then run manual_migration.sql commands
```

## Files Modified:
- ✅ `database_schema.sql` - Complete database schema
- ✅ `migrate.js` - Improved migration script with error handling
- ✅ `manual_migration.sql` - Manual SQL commands for direct execution
- ✅ `package.json` - Removed problematic postinstall script
- ✅ `src/server.js` - Added automatic migration on startup
- ✅ `src/controllers/authController.js` - Added fallback logic for password columns

## Migration Strategy:
1. **Automatic:** Server startup migration (primary method)
2. **Manual Script:** `npm run migrate` (backup method)
3. **Direct SQL:** Manual commands (emergency method)

## Next Steps:
1. Push code to Git repository
2. Wait for Render deployment
3. Check deployment logs for migration success
4. Test app functionality
5. If issues persist, use manual migration methods