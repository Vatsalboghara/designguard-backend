require("dotenv").config();
const { Resend } = require("resend");

// Initialize Resend with your API Key
const resend = new Resend(process.env.RESEND_API_KEY);

// Send OTP email
const sendOTP = async (email, otp) => {
  try {
    const data = await resend.emails.send({
      from: "onboarding@resend.dev", 
      to: email, 
      subject: "DesignGuard - Verify Your Email",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h3>Welcome to DesignGuard!</h3>
            <p>Your Verification Code is:</p>
            <h1 style="color: #4A90E2; letter-spacing: 5px;">${otp}</h1>
            <p>This code expires in 10 minutes.</p>
        </div>
      `,
    });

    console.log(`✅ OTP sent via Resend to ${email}:`, data);
    return data;
  } catch (error) {
    console.error("❌ Resend OTP Error:", error);
    throw new Error("Failed to send verification email");
  }
};

// Send password reset email
const sendPasswordReset = async (email, link) => {
  try {
    const data = await resend.emails.send({
      from: "onboarding@resend.dev", // ⚠️ MUST be this email for Free Tier
      to: email,
      subject: "DesignGuard - Password Reset",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h3>Password Reset Request</h3>
            <p>Click the button below to reset your password:</p>
            <a href="${link}" style="
              padding: 10px 16px;
              background: #007bff;
              color: #fff;
              text-decoration: none;
              border-radius: 4px;
              display: inline-block;
            ">Reset Password</a>
            <p style="margin-top: 20px; font-size: 12px; color: #666;">If you did not request this, please ignore this email.</p>
        </div>
      `,
    });

    console.log(`✅ Password reset email sent via Resend to ${email}:`, data);
    return data;
  } catch (error) {
    console.error("❌ Resend Reset Error:", error);
    throw new Error("Failed to send password reset email");
  }
};

module.exports = {
  sendOTP,
  sendPasswordReset,
};