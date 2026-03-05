const nodemailer = require('nodemailer');

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function sendPasswordResetCode({ to, code, username, ttlMinutes }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('SMTP not configured. Password reset email not sent.');
    return { sent: false };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = 'Your ArfidWatch password reset code';
  const text = [
    `Hi ${username || 'there'},`,
    '',
    'Use this code to reset your ArfidWatch password:',
    '',
    `${code}`,
    '',
    `This code expires in ${ttlMinutes} minutes.`,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
  });

  return { sent: true };
}

module.exports = {
  sendPasswordResetCode,
};
