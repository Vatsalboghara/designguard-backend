const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../config/db");
const { sendOTP, sendPasswordReset } = require("../utils/emailService");

// ✅ Always 6-digit OTP
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// ✅ Hash OTP
const hashOTP = (otp) =>
  crypto.createHash("sha256").update(otp).digest("hex");

// ================= REGISTER =================
exports.register = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const {
      full_name, email, password, mobile_number, role,
      company_name, gst_number, factory_address, logo_url,
      vepari_brand_name, city, vepari_gst_number,
    } = req.body;

    const userCheck = await client.query(
      "SELECT id FROM users WHERE email = $1 OR mobile_number = $2",
      [email, mobile_number]
    );

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: "User already exists." });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const otp = generateOTP();
    const otp_hash = hashOTP(otp);
    const otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);

    await client.query("BEGIN");

    const insertUserQuery = `
      INSERT INTO users
      (full_name, email, password_hash, mobile_number, role, otp_code, otp_expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id
    `;

    const userResult = await client.query(insertUserQuery, [
      full_name,
      email,
      password_hash,
      mobile_number,
      role,
      otp_hash,
      otp_expires_at,
    ]);

    const userId = userResult.rows[0].id;

    if (role === "factory_owner") {
      await client.query(
        `INSERT INTO factory_profiles
         (user_id, company_name, gst_number, factory_address, logo_url)
         VALUES ($1,$2,$3,$4,$5)`,
        [userId, company_name, gst_number, factory_address, logo_url]
      );
    }

    if (role === "vepari") {
      await client.query(
        `INSERT INTO vepari_profiles
         (user_id, vepari_brand_name, city, vepari_gst_number, logo_url)
         VALUES ($1,$2,$3,$4,$5)`,
        [userId, vepari_brand_name, city, vepari_gst_number, logo_url]
      );
    }

    await client.query("COMMIT");

    // 📧 Send OTP AFTER commit
    await sendOTP(email, otp);

    res.status(201).json({
      message: "Registered successfully. OTP sent to email.",
      userId,
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    console.log(error);
    
    res.status(500).json({ message: "Server Error" });
  } finally {
    client.release();
  }
};

// ================= VERIFY OTP =================
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const result = await db.query(
      "SELECT id, otp_code, otp_expires_at, is_verified FROM users WHERE email = $1",
      [email]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ message: "User already verified" });
    }

    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ message: "OTP expired" });
    }

    const hashedOTP = hashOTP(otp);

    if (hashedOTP !== user.otp_code) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    await db.query(
      `UPDATE users
       SET is_verified = TRUE, otp_code = NULL, otp_expires_at = NULL
       WHERE id = $1`,
      [user.id]
    );

    res.json({ message: "Email verified successfully" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ================= LOGIN =================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (!result.rows.length) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = result.rows[0];

    if (!user.is_verified) {
      return res.status(403).json({ message: "Verify email first" });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { user: { id: user.id, role: user.role } },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

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

// ================= FORGOT PASSWORD =================
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const token = jwt.sign(
      { user: { id: result.rows[0].id } },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${token}`;

    await sendPasswordReset(email, resetLink);

    res.json({ message: "Password reset link sent" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ================= RESET PASSWORD =================
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const password_hash = await bcrypt.hash(newPassword, 10);

    await db.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [password_hash, decoded.user.id]
    );

    res.json({ message: "Password reset successful" });

  } catch (error) {
    console.error(error);
    res.status(400).json({ message: "Invalid or expired token" });
  }
};
