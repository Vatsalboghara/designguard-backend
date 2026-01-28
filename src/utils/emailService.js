require("dotenv").config();
const nodemailer = require("nodemailer");
const { google } = require("googleapis");

// Create OAuth2 client
const oAuth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

// Set refresh token
oAuth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN,
});

// Create transporter using Gmail API
const createTransporter = async () => {
  const accessToken = await oAuth2Client.getAccessToken();

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.EMAIL_USER,
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      refreshToken: process.env.REFRESH_TOKEN,
      accessToken: accessToken.token,
    },
  });
};

// Send OTP email
const sendOTP = async (email, otp) => {
  try {
    const transporter = await createTransporter();

    await transporter.sendMail({
      from: `DesignGuard <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "DesignGuard - Verify Your Email",
      html: `
        <h3>Welcome to DesignGuard!</h3>
        <p>Your Verification Code is:</p>
        <h2>${otp}</h2>
        <p>This code expires in 10 minutes.</p>
      `,
    });

    console.log(`✅ OTP sent to ${email}`);
  } catch (error) {
    console.error("❌ Error sending OTP:", error);
    throw new Error("Failed to send verification email");
  }
};

// Send password reset email
const sendPasswordReset = async (email, link) => {
  try {
    const transporter = await createTransporter();

    await transporter.sendMail({
      from: `DesignGuard <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "DesignGuard - Password Reset",
      html: `
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
        <p>If you did not request this, ignore this email.</p>
      `,
    });

    console.log(`✅ Password reset email sent to ${email}`);
  } catch (error) {
    console.error("❌ Error sending reset email:", error);
    throw new Error("Failed to send password reset email");
  }
};

module.exports = {
  sendOTP,
  sendPasswordReset,
};
