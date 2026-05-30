const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

async function sendEmail(to, subject, html) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      html
    };
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    return false;
  }
}

async function sendVerificationEmail(email, token) {
  const verificationLink = `${process.env.FRONTEND_URL || ''}/verify-email.html?token=${token}`;
  const html = `
    <h2>Verify Your Email</h2>
    <p>Click the link below to verify your email address:</p>
    <a href="${verificationLink}" style="padding:10px 20px;background:#00E0FF;color:#000;text-decoration:none;border-radius:6px">Verify Email</a>
    <p>Or copy this link:</p>
    <p>${verificationLink}</p>
    <p>This link expires in 24 hours.</p>
  `;
  return sendEmail(email, 'Verify Your Email - VANTIS AI', html);
}

async function sendPasswordResetEmail(email, token) {
  const resetLink = `${process.env.FRONTEND_URL || ''}/reset-password.html?token=${token}`;
  const html = `
    <h2>Reset Your Password</h2>
    <p>Click the link below to reset your password:</p>
    <a href="${resetLink}" style="padding:10px 20px;background:#00E0FF;color:#000;text-decoration:none;border-radius:6px">Reset Password</a>
    <p>Or copy this link:</p>
    <p>${resetLink}</p>
    <p>This link expires in 1 hour.</p>
    <p>If you didn't request this, ignore this email.</p>
  `;
  return sendEmail(email, 'Reset Your Password - VANTIS AI', html);
}

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail };
