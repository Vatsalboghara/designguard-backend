require('dotenv').config();
const SibApiV3Sdk = require('sib-api-v3-sdk');

// Brevo API Config
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY; 

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// 1. Send OTP Function
const sendOTP = async (email, otp) => {
    
    // Sender Email (Je Brevo ma verify karelo hoi)
    const sender = {
        email: 'saykokiller45@gmail.com', 
        name: 'DesignGuard App' 
    };

    const receivers = [
        { email: email } 
    ];

    try {
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = "DesignGuard - Verify Your Email";
        sendSmtpEmail.htmlContent = `
            <html>
                <body>
                    <h1>Welcome to DesignGuard</h1>
                    <p>Your Verification Code is:</p>
                    <h2 style="color:blue;">${otp}</h2>
                    <p>Valid for 10 minutes.</p>
                </body>
            </html>
        `;
        sendSmtpEmail.sender = sender;
        sendSmtpEmail.to = receivers;

        // API Call (No SMTP Port used)
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log('✅ OTP sent via Brevo API to:', email);
        return data;

    } catch (error) {
        console.error('❌ Brevo API Error:', error);
        throw new Error('Failed to send email via Brevo');
    }
};

// 2. Send Password Reset Function
const sendPasswordReset = async (email, link) => {
    
    const sender = {
        email: 'vatsalboghara70@gmail.com', // ⚠️ AHIN TAMARO J EMAIL LAKHJO
        name: 'DesignGuard App'
    };

    const receivers = [
        { email: email }
    ];

    try {
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = "Reset Your Password";
        sendSmtpEmail.htmlContent = `
            <html>
                <body>
                    <h1>Password Reset Request</h1>
                    <p>Click link to reset:</p>
                    <a href="${link}">Reset Password</a>
                </body>
            </html>
        `;
        sendSmtpEmail.sender = sender;
        sendSmtpEmail.to = receivers;

        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log('✅ Reset link sent via Brevo API to:', email);
        return data;

    } catch (error) {
        console.error('❌ Brevo API Error:', error);
        throw new Error('Failed to send email via Brevo');
    }
};

module.exports = { sendOTP, sendPasswordReset };