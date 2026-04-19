require('dotenv').config();
const nodemailer = require('nodemailer');

(async () => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  console.log('Verifying SMTP connection...');
  try {
    await transporter.verify();
    console.log('✅ SMTP connection OK');
  } catch (err) {
    console.error('❌ SMTP verify failed:', err.message);
    process.exit(1);
  }

  console.log('Sending test email...');
  try {
    const info = await transporter.sendMail({
      from: '"InboxAI" <onboarding@resend.dev>',
      to: 'throwaway53453@gmail.com',
      subject: 'InboxAI SMTP Test',
      html: '<p>This is a test email from the InboxAI backend SMTP test script.</p>',
    });
    console.log('✅ Sent. messageId:', info.messageId);
    console.log('Response:', info.response);
  } catch (err) {
    console.error('❌ sendMail failed:', err.message);
    process.exit(1);
  }
})();
