const db = require("../config/db");
const cloudinary = require("../config/cloudinary");

// Get current user's profile
exports.getProfile = async (req, res) => {
  console.log('🚀 Profile Controller - getProfile called');
  let client;

  try {
    client = await db.pool.connect();
    console.log('✅ Profile Controller - DB Connected');

    if (!req.user) {
      console.error('❌ Profile Controller - req.user is undefined! Middleware failed?');
      return res.status(401).json({ message: "Authentication failed" });
    }

    const userId = req.user.id;
    const userRole = req.user.role;

    console.log(`🔄 Profile Controller - Getting profile for user ${userId} with role ${userRole}`);

    // Get user basic info
    const userQuery = `
      SELECT id, full_name, email, mobile_number, role, created_at, is_verified
      FROM users 
      WHERE id = $1
    `;
    const userResult = await client.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      console.log(`❌ Profile Controller - User ${userId} not found in database`);
      return res.status(404).json({ message: "User not found" });
    }

    const user = userResult.rows[0];
    let profileData = { ...user };

    console.log(`✅ Profile Controller - Found user: ${user.full_name}`);

    // Get role-specific profile data
    if (userRole === 'vepari') {
      const vepariQuery = `
        SELECT vepari_brand_name, city, vepari_gst_number, logo_url, bio, 
               profile_picture_url, business_type, established_year
        FROM vepari_profiles 
        WHERE user_id = $1
      `;
      const vepariResult = await client.query(vepariQuery, [userId]);

      console.log(`🔍 Profile Controller - Vepari profile query result: ${vepariResult.rows.length} rows`);

      if (vepariResult.rows.length > 0) {
        profileData = { ...profileData, ...vepariResult.rows[0] };
        console.log(`✅ Profile Controller - Added vepari profile data`);
      } else {
        console.log(`⚠️  Profile Controller - No vepari profile found for user ${userId}`);
      }
    } else if (userRole === 'factory_owner') {
      const factoryQuery = `
        SELECT company_name, gst_number, factory_address, logo_url, bio,
               profile_picture_url, established_year, employee_count
        FROM factory_profiles 
        WHERE user_id = $1
      `;
      const factoryResult = await client.query(factoryQuery, [userId]);

      console.log(`🔍 Profile Controller - Factory profile query result: ${factoryResult.rows.length} rows`);

      if (factoryResult.rows.length > 0) {
        profileData = { ...profileData, ...factoryResult.rows[0] };
        console.log(`✅ Profile Controller - Added factory profile data`);
      } else {
        console.log(`⚠️  Profile Controller - No factory profile found for user ${userId}`);
      }
    }

    console.log(`🎉 Profile Controller - Returning profile data for ${user.full_name}`);

    res.json({
      success: true,
      data: profileData
    });

  } catch (error) {
    console.error('❌ Profile Controller - Error fetching profile:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile: " + error.message
    });
  } finally {
    if (client) client.release();
  }
};

// Update current user's profile
exports.updateProfile = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const {
      full_name,
      mobile_number,
      // Vepari specific
      vepari_brand_name,
      city,
      vepari_gst_number,
      bio,
      business_type,
      established_year,
      // Factory specific
      company_name,
      gst_number,
      factory_address,
      employee_count
    } = req.body;

    await client.query('BEGIN');

    // Update user basic info
    if (full_name || mobile_number) {
      const updateUserQuery = `
        UPDATE users 
        SET full_name = COALESCE($1, full_name),
            mobile_number = COALESCE($2, mobile_number),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `;
      await client.query(updateUserQuery, [full_name, mobile_number, userId]);
    }

    // Update role-specific profile
    if (userRole === 'vepari') {
      const updateVepariQuery = `
        UPDATE vepari_profiles 
        SET vepari_brand_name = COALESCE($1, vepari_brand_name),
            city = COALESCE($2, city),
            vepari_gst_number = COALESCE($3, vepari_gst_number),
            bio = COALESCE($4, bio),
            business_type = COALESCE($5, business_type),
            established_year = COALESCE($6, established_year),
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $7
      `;
      await client.query(updateVepariQuery, [
        vepari_brand_name, city, vepari_gst_number, bio,
        business_type, established_year, userId
      ]);
    } else if (userRole === 'factory_owner') {
      const updateFactoryQuery = `
        UPDATE factory_profiles 
        SET company_name = COALESCE($1, company_name),
            gst_number = COALESCE($2, gst_number),
            factory_address = COALESCE($3, factory_address),
            bio = COALESCE($4, bio),
            established_year = COALESCE($5, established_year),
            employee_count = COALESCE($6, employee_count),
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $7
      `;
      await client.query(updateFactoryQuery, [
        company_name, gst_number, factory_address, bio,
        established_year, employee_count, userId
      ]);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: "Profile updated successfully"
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile"
    });
  } finally {
    client.release();
  }
};

// Upload profile picture
exports.uploadProfilePicture = async (req, res) => {
  console.log('🖼️ Profile Controller - uploadProfilePicture called');
  const client = await db.pool.connect();
  
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    console.log(`📤 Uploading profile picture for user ${userId} (${userRole})`);

    if (!req.file) {
      console.log('❌ No file provided in request');
      return res.status(400).json({
        success: false,
        message: "No image file provided"
      });
    }

    console.log(`📁 File received: ${req.file.originalname}, size: ${req.file.size} bytes`);

    // Upload to Cloudinary using buffer (memory storage)
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: 'designguard/profile_pictures',
          public_id: `profile_${userId}_${Date.now()}`,
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto', fetch_format: 'auto' }
          ]
        },
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary upload error:', error);
            reject(error);
          } else {
            console.log('✅ Cloudinary upload successful:', result.secure_url);
            resolve(result);
          }
        }
      ).end(req.file.buffer);
    });

    const profilePictureUrl = uploadResult.secure_url;

    // Update profile picture URL in database
    let updateQuery;
    if (userRole === 'vepari') {
      updateQuery = `
        UPDATE vepari_profiles 
        SET profile_picture_url = $1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
        RETURNING profile_picture_url
      `;
    } else if (userRole === 'factory_owner') {
      updateQuery = `
        UPDATE factory_profiles 
        SET profile_picture_url = $1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
        RETURNING profile_picture_url
      `;
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid user role"
      });
    }

    const dbResult = await client.query(updateQuery, [profilePictureUrl, userId]);
    
    if (dbResult.rows.length === 0) {
      console.log(`⚠️ No profile found for user ${userId} with role ${userRole}`);
      return res.status(404).json({
        success: false,
        message: "Profile not found. Please complete your profile first."
      });
    }

    console.log(`🎉 Profile picture updated successfully for user ${userId}`);

    res.json({
      success: true,
      data: { 
        profile_picture_url: profilePictureUrl,
        cloudinary_public_id: uploadResult.public_id
      },
      message: "Profile picture updated successfully"
    });

  } catch (error) {
    console.error('❌ Error uploading profile picture:', error);
    res.status(500).json({
      success: false,
      message: "Failed to upload profile picture: " + error.message
    });
  } finally {
    client.release();
  }
};

// Get public profile (for viewing other users)
exports.getPublicProfile = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { userId } = req.params;

    // Get user basic info (public fields only)
    const userQuery = `
      SELECT id, full_name, role, created_at, is_verified
      FROM users 
      WHERE id = $1
    `;
    const userResult = await client.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = userResult.rows[0];
    let profileData = { ...user };

    // Get role-specific public profile data
    if (user.role === 'vepari') {
      const vepariQuery = `
        SELECT vepari_brand_name, city, logo_url, bio, 
               profile_picture_url, business_type, established_year
        FROM vepari_profiles 
        WHERE user_id = $1
      `;
      const vepariResult = await client.query(vepariQuery, [userId]);

      if (vepariResult.rows.length > 0) {
        profileData = { ...profileData, ...vepariResult.rows[0] };
      }
    } else if (user.role === 'factory_owner') {
      const factoryQuery = `
        SELECT company_name, factory_address, logo_url, bio,
               profile_picture_url, established_year, employee_count
        FROM factory_profiles 
        WHERE user_id = $1
      `;
      const factoryResult = await client.query(factoryQuery, [userId]);

      if (factoryResult.rows.length > 0) {
        profileData = { ...profileData, ...factoryResult.rows[0] };
      }
    }

    res.json({
      success: true,
      data: profileData
    });

  } catch (error) {
    console.error('Error fetching public profile:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile"
    });
  } finally {
    client.release();
  }
};