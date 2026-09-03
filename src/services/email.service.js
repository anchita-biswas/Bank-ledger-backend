const nodemailer = require("nodemailer");

/**
 * - Email is a notification channel, not part of the ledger guarantees.
 * - When the OAuth credentials are absent the service degrades to a no-op so
 *   the API still boots and transfers still settle.
 */
const isConfigured = Boolean(
  process.env.EMAIL_USER &&
    process.env.CLIENT_ID &&
    process.env.CLIENT_SECRET &&
    process.env.REFRESH_TOKEN,
);

const transporter = isConfigured
  ? nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.EMAIL_USER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN,
      },
    })
  : null;

if (!isConfigured) {
  console.warn("Email credentials not set, notification emails are disabled");
} else {
  // Verify the connection configuration
  transporter.verify((error) => {
    if (error) {
      console.error("Error connecting to email server:", error.message);
    } else {
      console.log("Email server is ready to send messages");
    }
  });
}

// Function to send email
const sendEmail = async (to, subject, text, html) => {
  if (!transporter) {
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: `"Backend Ledger" <${process.env.EMAIL_USER}>`, // sender address
      to, // list of receivers
      subject, // Subject line
      text, // plain text body
      html, // html body
    });

    console.log("Message sent: %s", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error.message);
  }
};

async function sendRegistrationEmail(userEmail, name) {
  const subject = "Welcome to Backend Ledger!";
  const text = `Hello ${name},\n\nThank you for registering at Backend Ledger. We're excited to have you on board!\n\nBest regards,\nThe Backend Ledger Team`;
  const html = `<p>Hello ${name},</p><p>Thank you for registering at Backend Ledger. We're excited to have you on board!</p><p>Best regards,<br>The Backend Ledger Team</p>`;

  await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionEmail(userEmail, name, amount, toAccount) {
  const subject = "Transaction Successful!";
  const text = `Hello ${name},\n\nYour transaction of ${amount} to account ${toAccount} was successful.\n\nBest regards,\nThe Backend Ledger Team`;
  const html = `<p>Hello ${name},</p><p>Your transaction of ${amount} to account ${toAccount} was successful.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

  await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionFailureEmail(userEmail, name, amount, toAccount) {
  const subject = "Transaction Failed";
  const text = `Hello ${name},\n\nWe regret to inform you that your transaction of ${amount} to account ${toAccount} has failed. Please try again later.\n\nBest regards,\nThe Backend Ledger Team`;
  const html = `<p>Hello ${name},</p><p>We regret to inform you that your transaction of ${amount} to account ${toAccount} has failed. Please try again later.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

  await sendEmail(userEmail, subject, text, html);
}

module.exports = {
  sendRegistrationEmail,
  sendTransactionEmail,
  sendTransactionFailureEmail,
};
