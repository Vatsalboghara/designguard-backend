const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { sendOTP, sendPasswordReset } = require("../utils/emailService");

//6-digit otp generator
const generateOTP = () => Math.floor(1000 + Math.random() * 900000).toString();

//registration
exports.register = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const {
      full_name,
      email,
      password,
      mobile_number,
      role,
      //factory owner
      company_name,
      gst_number,
      factory_address,
      logo_url,
      //vepari
      vepari_brand_name,
      city,
      vepari_gst_number,
    } = req.body;

    //check user exists
    const userCheck = await client.query(
      "SELECT * FROM users WHERE email = $1 or mobile_number = $2",
      [email, mobile_number],
    );
    if (userCheck.rows.length > 0) {
      return res.status(400).json({
        message: "User with this email or mobile number already exists.",
      });
    }

    //hash pass
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    //generate otp
    const otp_code = generateOTP();
    const otp_expires_at = new Date(Date.now() + 10 * 60 * 1000); //10 min

    await client.query("BEGIN");

    // Check if password_hash column exists, fallback to password column
    let insertUserQuery;
    let queryParams;
    let userId;
    
    try {
      // Try with password_hash column first
      insertUserQuery = `INSERT INTO users (full_name, email, password_hash, mobile_number, role, otp_code, otp_expires_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id`;
      
      queryParams = [
        full_name,
        email,
        password_hash,
        mobile_number,
        role,
        otp_code,
        otp_expires_at,
      ];
      
      const userResult = await client.query(insertUserQuery, queryParams);
      userId = userResult.rows[0].id;
      
    } catch (err) {
      // If password_hash column doesn't exist, try password column
      if (err.code === '42703') {
        console.log('password_hash column not found, using password column');
        insertUserQuery = `INSERT INTO users (full_name, email, password, mobile_number, role, otp_code, otp_expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id`;
        
        const userResult = await client.query(insertUserQuery, queryParams);
        console.log("line 85 auth js", userResult);
        
        userId = userResult.rows[0].id;
      } else {
        throw err;
      }
    }

    //insert profile based on role
    if (role === "factory_owner") {
      if (!company_name)
        throw new Error("Company Name is requires for Factory Owner");
      const insertFactoryQuery = `INSERT INTO factory_profiles (user_id, company_name, gst_number, factory_address, logo_url)
                VALUES ($1, $2, $3, $4, $5)`;
      await client.query(insertFactoryQuery, [
        userId,
        company_name,
        gst_number,
        factory_address,
        logo_url,
      ]);
    } else if (role === "vepari") {
      if (!vepari_brand_name || !city)
        throw new Error("Brand Name and City are required for vepari");
      const insertVepariQuery = `INSERT INTO vepari_profiles (user_id, vepari_brand_name, city, vepari_gst_number, logo_url)
                VALUES ($1, $2, $3, $4, $5)`;
      await client.query(insertVepariQuery, [
        userId,
        vepari_brand_name,
        city,
        vepari_gst_number,
        logo_url,
      ]);
    }

    await client.query("COMMIT");

    // Send OTP email (with error handling)
    try {
      await sendOTP(email, otp_code);
      console.log(`✅ OTP sent successfully to ${email}`);
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError.message);
      
      // For development/testing - auto-verify user if email fails
      if (process.env.NODE_ENV !== 'production') {
        console.log('🔧 Development mode: Auto-verifying user due to email failure');
        await client.query(
          "UPDATE users SET is_verified = TRUE, otp_code = NULL, otp_expires_at = NULL WHERE id = $1",
          [userId]
        );
        return res.status(201).json({
          message: "User registered and auto-verified (email service unavailable)",
          userId,
          autoVerified: true
        });
      }
      
      // In production, still fail if email can't be sent
      throw emailError;
    }

    res.status(201).json({
      message: "User registered successfully. Please verify your email via OTP.",
      userId,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res
      .status(500)
      .json({ message: "Server Verification Error", error: error.message });
  } finally {
    client.release();
  }
};

//otp verification
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const userResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const user = userResult.rows[0];
    if (user.is_verified) {
      return res.status(400).json({ message: "User already verified" });
    }
    if (user.otp_code !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ message: "OTP Expired" });
    }
    // Verify User
    await db.query(
      "UPDATE users SET is_verified = TRUE, otp_code = NULL, otp_expires_at = NULL WHERE id = $1",
      [user.id],
    );
    res
      .status(200)
      .json({ message: "Email verified successfully. You can now login." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

//login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const userResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }
    const user = userResult.rows[0];
    
    // Check if user is verified or if we're in development mode
    if (!user.is_verified) {
      // In development, allow login even if not verified
      if (process.env.NODE_ENV !== 'production') {
        console.log('🔧 Development mode: Allowing unverified user login');
        // Auto-verify the user
        await db.query(
          "UPDATE users SET is_verified = TRUE WHERE id = $1",
          [user.id]
        );
        user.is_verified = true; // Update local object
      } else {
        return res
          .status(403)
          .json({ message: "Please verify your email first." });
      }
    }
    // Check password using password_hash column or fallback to password column
    const passwordToCheck = user.password_hash || user.password;
    if (!passwordToCheck) {
      return res.status(500).json({ message: "Password data not found" });
    }
    
    const isMatch = await bcrypt.compare(password, passwordToCheck);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }
    // Create Token
    const payload = {
      user: {
        id: user.id,
        role: user.role,
      },
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

//forgot password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const userResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const user = userResult.rows[0];
    const payload = {
      user: {
        id: user.id,
      },
    };
    const resetToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const resetLink = `${frontendUrl}/reset-password/${resetToken}`;
    await sendPasswordReset(email, resetLink);
    res.status(200).json({ message: "Password reset link sent to email." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

//reset password
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res
        .status(400)
        .json({ message: "Token and new password are required." });
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.user.id;
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(newPassword, salt);
      
      // Try to update password_hash column, fallback to password column
      try {
        await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
          password_hash,
          userId,
        ]);
      } catch (err) {
        // If password_hash column doesn't exist, try password column
        if (err.code === '42703') {
          await db.query("UPDATE users SET password = $1 WHERE id = $2", [
            password_hash,
            userId,
          ]);
        } else {
          throw err;
        }
      }
      
      res
        .status(200)
        .json({ message: "Password has been reset successfully." });
    } catch (err) {
      return res.status(400).json({ message: "Invalid or expired token." });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};
