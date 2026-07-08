import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Creates a reusable transporter using SMTP settings from .env.
 * Supports Gmail, Outlook, custom SMTP, or falls back to Ethereal for dev.
 */
let transporter = null;

const getTransporter = async () => {
  if (transporter) return transporter;

  const smtpService = process.env.SMTP_SERVICE; // e.g. 'gmail', 'hotmail', 'outlook', 'yahoo'
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpUser && smtpPass && (smtpService || smtpHost)) {
    const transportConfig = {
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    };

    if (smtpService) {
      transportConfig.service = smtpService;
      console.log(`Email service configured with Service provider: ${smtpService}`);
    } else {
      transportConfig.host = smtpHost;
      transportConfig.port = smtpPort;
      transportConfig.secure = smtpPort === 465;
      console.log(`Email service configured with SMTP Host: ${smtpHost}:${smtpPort}`);
    }

    transporter = nodemailer.createTransport(transportConfig);
  } else {
    // Create Ethereal test account for development
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('Email service: Using Ethereal test account (dev mode)');
    console.log(`  Ethereal User: ${testAccount.user}`);
    console.log('  View sent emails at: https://ethereal.email/messages');
  }

  return transporter;
};

/**
 * Sends a verification OTP code to user's email
 */
export const sendVerificationEmail = async (toEmail, otpCode, userName) => {
  const mail = await getTransporter();
  const fromName = process.env.EMAIL_FROM_NAME || 'CropGuard AI';
  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@cropguard.ai';

  const htmlBody = `
    <div style="font-family: 'Inter', 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 0;">
      <div style="background: linear-gradient(135deg, #0A0E21, #1A1F38); border-radius: 20px; padding: 40px 32px; text-align: center;">
        <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #00E676, #00BCD4); border-radius: 18px; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 32px;">🌿</span>
        </div>
        <h1 style="color: #F5F5F5; font-size: 24px; margin: 0 0 8px;">Verify Your Email</h1>
        <p style="color: #B0BEC5; font-size: 15px; margin: 0 0 32px; line-height: 1.5;">
          Hi ${userName || 'there'}, use the code below to verify your CropGuard AI account.
        </p>
        <div style="background: rgba(0, 230, 118, 0.1); border: 1px solid rgba(0, 230, 118, 0.25); border-radius: 14px; padding: 20px; margin: 0 0 32px;">
          <span style="font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #00E676; font-family: 'Courier New', monospace;">
            ${otpCode}
          </span>
        </div>
        <p style="color: #78909C; font-size: 13px; margin: 0; line-height: 1.5;">
          This code expires in <strong style="color: #B0BEC5;">10 minutes</strong>.<br/>
          If you didn't request this, please ignore this email.
        </p>
      </div>
      <p style="color: #78909C; font-size: 11px; text-align: center; margin-top: 20px;">
        © ${new Date().getFullYear()} CropGuard AI · Protect Your Crops with Intelligence
      </p>
    </div>
  `;

  const info = await mail.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: toEmail,
    subject: `${otpCode} — Your CropGuard AI Verification Code`,
    text: `Your CropGuard AI verification code is: ${otpCode}. This code expires in 10 minutes.`,
    html: htmlBody,
  });

  console.log(`Verification email sent to ${toEmail}: ${info.messageId}`);

  // Log preview URL for Ethereal in dev mode
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`  Preview URL: ${previewUrl}`);
  }

  return info;
};

/**
 * Sends a password reset OTP code to user's email
 */
export const sendPasswordResetEmail = async (toEmail, otpCode, userName) => {
  const mail = await getTransporter();
  const fromName = process.env.EMAIL_FROM_NAME || 'CropGuard AI';
  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@cropguard.ai';

  const htmlBody = `
    <div style="font-family: 'Inter', 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 0;">
      <div style="background: linear-gradient(135deg, #0A0E21, #1A1F38); border-radius: 20px; padding: 40px 32px; text-align: center;">
        <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #7C4DFF, #448AFF); border-radius: 18px; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 32px;">🔐</span>
        </div>
        <h1 style="color: #F5F5F5; font-size: 24px; margin: 0 0 8px;">Reset Your Password</h1>
        <p style="color: #B0BEC5; font-size: 15px; margin: 0 0 32px; line-height: 1.5;">
          Hi ${userName || 'there'}, use the code below to reset your CropGuard AI password.
        </p>
        <div style="background: rgba(124, 77, 255, 0.1); border: 1px solid rgba(124, 77, 255, 0.25); border-radius: 14px; padding: 20px; margin: 0 0 32px;">
          <span style="font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #7C4DFF; font-family: 'Courier New', monospace;">
            ${otpCode}
          </span>
        </div>
        <p style="color: #78909C; font-size: 13px; margin: 0; line-height: 1.5;">
          This code expires in <strong style="color: #B0BEC5;">10 minutes</strong>.<br/>
          If you didn't request a password reset, you can safely ignore this email.
        </p>
      </div>
      <p style="color: #78909C; font-size: 11px; text-align: center; margin-top: 20px;">
        © ${new Date().getFullYear()} CropGuard AI · Protect Your Crops with Intelligence
      </p>
    </div>
  `;

  const info = await mail.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: toEmail,
    subject: `${otpCode} — Reset Your CropGuard AI Password`,
    text: `Your CropGuard AI password reset code is: ${otpCode}. This code expires in 10 minutes.`,
    html: htmlBody,
  });

  console.log(`Password reset email sent to ${toEmail}: ${info.messageId}`);

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`  Preview URL: ${previewUrl}`);
  }

  return info;
};
