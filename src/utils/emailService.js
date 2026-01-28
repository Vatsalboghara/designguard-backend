require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: "gmail",  
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Test email configuration on startup
const testEmailConfig = async () => {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            throw new Error('Email credentials not configured');
        }
        await transporter.verify();
        console.log('✅ Email service is ready');
        return true;
    } catch (error) {
        console.log(error);
        
        console.error('❌ Email service configuration error:', error.message);
        return false;
    }
};

// Call test on module load
testEmailConfig();

const sendOTP = async (email, otp) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'DesignGuard - Verify Your Email',
        text: `Your Verification Code is: ${otp}. It expires in 10 minutes.`,
        html: `<h3>Welcome to DesignGuard!</h3><p>Your Verification Code is: <b>${otp}</b></p><p>It expires in 10 minutes.</p>`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`OTP sent to ${email}`);
    } catch (error) {
        console.error('Error sending OTP email:', error);
        throw new Error('Failed to send verification email.');
    }
};

const sendPasswordReset = async (email, link) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'DesignGuard - Password Reset Request',
        text: `You requested a password reset. Click the following link to reset your password: ${link}`,
        html: `<h3>Password Reset Request</h3><p>You requested a password reset. Click the button below to reset your password:</p><a href="${link}" style="padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a><p>If you did not request this, please ignore this email.</p>`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Password reset link sent to ${email}`);
    } catch (error) {
        console.error('Error sending password reset email:', error);
        throw new Error('Failed to send password reset email.');
    }
};

module.exports = {
    sendOTP,
    sendPasswordReset,
};
