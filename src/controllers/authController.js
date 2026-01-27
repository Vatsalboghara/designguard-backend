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

    //insert user
    const insertUserQuery = `INSERT INTO users (full_name, email, password_hash, mobile_number, role, otp_code, otp_expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`;

    const userResult = await client.query(insertUserQuery, [
      full_name,
      email,
      password_hash,
      mobile_number,
      role,
      otp_code,
      otp_expires_at,
    ]);
    const userId = userResult.rows[0].id;

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

    //send otp email
    await sendOTP(email, otp_code);
    res.status(201).json({
      message:
        "User registered successfully. Please verify your email via OTP.",
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
    if (!user.is_verified) {
      return res
        .status(403)
        .json({ message: "Please verify your email first." });
    }
    const isMatch = await bcrypt.compare(password, user.password_hash);
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
      await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        password_hash,
        userId,
      ]);
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
