const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: process.env.EMAIL_USER,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    refreshToken: process.env.REFRESH_TOKEN,
  },
});

// Verify the connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Error connecting to email server:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});

// Function to send email
const sendEmail = async (to, subject, text, html) => {
  try {
    const info = await transporter.sendMail({
      from: `"Banking Ledger" <${process.env.EMAIL_USER}>`, // sender address
      to, // list of receivers
      subject, // Subject line
      text, // plain text body
      html, // html body
    });

    console.log('Message sent: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

async function sendRegistrationEmail(userEmail, name){
    const subject = "Welcome to Banking ledger"
    const text = `Hello ${name}, \n\n Thank You for registartion at Banking-Transaction-System.
    We're excited to have you on board!\n\nBest Regards,\nThe Banking Ledger System team.
    `;
    const html = `<p>Helllo ${name}, </p><p>Thank You for registartion at Banking-Transaction-System. 
    We're excited to have you on board!</p><p>Best Regards,<br> The Banking Ledger System Team</p>`;
    
    await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionEmail(userEmail, name, amount, toAccount) {
    const subject = "Transaction Successful";

    const text = `Hello ${name},

Your transaction has been completed successfully.

Amount: ₹${amount}
Transferred To: ${toAccount}

Thank you for using Banking Ledger.

Best Regards,
The Banking Ledger Team`;

    const html = `
    <h2>Transaction Successful</h2>
    <p>Hello ${name},</p>
    <p>Your transaction has been completed successfully.</p>

    <ul>
        <li><strong>Amount:</strong> ₹${amount}</li>
        <li><strong>Transferred To:</strong> ${toAccount}</li>
    </ul>

    <p>Thank you for using Banking Ledger.</p>

    <p>
        Best Regards,<br>
        The Banking Ledger Team
    </p>
    `;

    await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionFailureEmail(
    userEmail,
    name,
    amount,
    toAccount,
    reason = "Insufficient balance"
) {
    const subject = "Transaction Failed";

    const text = `Hello ${name},

We were unable to process your transaction.

Amount: ₹${amount}
Attempted Transfer To: ${toAccount}
Reason: ${reason}

Please verify your account details and try again.

Best Regards,
The Banking Ledger Team`;

    const html = `
    <h2>Transaction Failed</h2>

    <p>Hello ${name},</p>

    <p>We were unable to process your transaction.</p>

    <ul>
        <li><strong>Amount:</strong> ₹${amount}</li>
        <li><strong>Attempted Transfer To:</strong> ${toAccount}</li>
        <li><strong>Reason:</strong> ${reason}</li>
    </ul>

    <p>Please verify your account details and try again.</p>

    <p>
        Best Regards,<br>
        The Banking Ledger Team
    </p>
    `;

    await sendEmail(userEmail, subject, text, html);
}

module.exports = {
    sendRegistrationEmail,
    sendTransactionEmail,
    sendTransactionFailureEmail
};