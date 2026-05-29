function sendEmail({ to, subject, text, html }) {
  console.log(`[VANTIS AI EMAIL] To: ${to}`);
  console.log(`[VANTIS AI EMAIL] Subject: ${subject}`);
  console.log(`[VANTIS AI EMAIL] Body: ${text}`);
  if (html) console.log(`[VANTIS AI EMAIL] HTML: ${html.substring(0, 200)}...`);
}

async function sendVerificationEmail(email, token, req) {
  const link = `${req.protocol}://${req.get('host')}/verify-email.html?token=${token}`;
  sendEmail({
    to: email,
    subject: 'Verify your VANTIS AI account',
    text: `Welcome to VANTIS AI!\n\nPlease verify your email by clicking this link:\n${link}\n\nThis link expires in 24 hours.\n\nIf you did not create an account, ignore this email.`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#1A1A1F;border:1px solid #2A2A35;border-radius:12px;padding:32px;color:#E8E8F0">
      <h1 style="background:linear-gradient(135deg,#00E0FF,#7A00FF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:24px;margin:0 0 16px">VANTIS AI</h1>
      <p style="color:#8888A0;line-height:1.6">Welcome to VANTIS AI! Please verify your email address to start building trading bots.</p>
      <a href="${link}" style="display:inline-block;padding:12px 32px;margin:20px 0;background:linear-gradient(135deg,#00E0FF,#7A00FF);color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Verify Email</a>
      <p style="color:#8888A0;font-size:12px">This link expires in 24 hours. If you did not create an account, ignore this email.</p>
    </div>`
  });
}

async function sendPasswordResetEmail(email, token, req) {
  const link = `${req.protocol}://${req.get('host')}/reset-password.html?token=${token}`;
  sendEmail({
    to: email,
    subject: 'Reset your VANTIS AI password',
    text: `You requested a password reset.\n\nClick this link to reset your password:\n${link}\n\nThis link expires in 30 minutes.\n\nIf you did not request this, ignore this email.`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#1A1A1F;border:1px solid #2A2A35;border-radius:12px;padding:32px;color:#E8E8F0">
      <h1 style="background:linear-gradient(135deg,#00E0FF,#7A00FF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:24px;margin:0 0 16px">VANTIS AI</h1>
      <p style="color:#8888A0;line-height:1.6">You requested a password reset. Click the button below to set a new password.</p>
      <a href="${link}" style="display:inline-block;padding:12px 32px;margin:20px 0;background:linear-gradient(135deg,#00E0FF,#7A00FF);color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Reset Password</a>
      <p style="color:#8888A0;font-size:12px">This link expires in 30 minutes. If you did not request this, ignore this email.</p>
    </div>`
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };