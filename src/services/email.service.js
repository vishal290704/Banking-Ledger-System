const nodemailer = require("nodemailer")

/*
 * Create the SMTP/OAuth2 transporter.
 *
 * We intentionally do not call transporter.verify() here.
 * Importing this module should not trigger an external network call.
 */
const transporter = nodemailer.createTransport({
    service: "gmail",

    auth: {
        type: "OAuth2",
        user: process.env.EMAIL_USER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN
    }
})

/**
 * Verify email transporter configuration/connectivity.
 *
 * This can be called explicitly during application startup or
 * as a health/readiness check.
 */
async function verifyEmailService() {
    await transporter.verify()
    return true
}

/**
 * Generic email sender.
 *
 * IMPORTANT:
 * Errors are re-thrown.
 * The caller decides whether an email failure should affect
 * the surrounding business operation.
 */
async function sendEmail(to, subject, text, html) {
    if (!to) {
        throw new Error("Recipient email address is required")
    }

    if (!process.env.EMAIL_USER) {
        throw new Error("EMAIL_USER is not configured")
    }

    const info = await transporter.sendMail({
        from: `"Banking Ledger" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        text,
        html
    })

    console.log(
        `Email sent successfully. messageId=${info.messageId}`
    )

    return info
}

/**
 * Registration email.
 */
async function sendRegistrationEmail(userEmail, name) {
    const subject = "Welcome to Banking Ledger"

    const text = `Hello ${name},

Thank you for registering with Banking Ledger.

We're excited to have you on board!

Best Regards,
The Banking Ledger Team
`

    const html = `
        <h2>Welcome to Banking Ledger</h2>

        <p>Hello ${name},</p>

        <p>
            Thank you for registering with Banking Ledger.
            We're excited to have you on board!
        </p>

        <p>
            Best Regards,<br>
            The Banking Ledger Team
        </p>
    `

    return sendEmail(
        userEmail,
        subject,
        text,
        html
    )
}

/**
 * Successful transaction email.
 */
async function sendTransactionEmail({
    userEmail,
    name,
    amount,
    currency = "INR",
    toAccount,
    transactionId,
    timestamp = new Date()
}) {
    const subject = "Transaction Successful"

    const formattedTimestamp =
        new Date(timestamp).toISOString()

    const text = `Hello ${name},

Your transaction has been completed successfully.

Transaction ID: ${transactionId}
Amount: ${currency} ${amount}
Transferred To: ${toAccount}
Time: ${formattedTimestamp}

Thank you for using Banking Ledger.

Best Regards,
The Banking Ledger Team
`

    const html = `
        <h2>Transaction Successful</h2>

        <p>Hello ${name},</p>

        <p>
            Your transaction has been completed successfully.
        </p>

        <ul>
            <li>
                <strong>Transaction ID:</strong>
                ${transactionId}
            </li>

            <li>
                <strong>Amount:</strong>
                ${currency} ${amount}
            </li>

            <li>
                <strong>Transferred To:</strong>
                ${toAccount}
            </li>

            <li>
                <strong>Time:</strong>
                ${formattedTimestamp}
            </li>
        </ul>

        <p>
            Thank you for using Banking Ledger.
        </p>

        <p>
            Best Regards,<br>
            The Banking Ledger Team
        </p>
    `

    return sendEmail(
        userEmail,
        subject,
        text,
        html
    )
}

/**
 * Failed transaction email.
 */
async function sendTransactionFailureEmail({
    userEmail,
    name,
    amount,
    currency = "INR",
    toAccount,
    reason,
    transactionId,
    timestamp = new Date()
}) {
    const subject = "Transaction Failed"

    const formattedTimestamp =
        new Date(timestamp).toISOString()

    const text = `Hello ${name},

We were unable to process your transaction.

Transaction ID: ${transactionId}
Amount: ${currency} ${amount}
Attempted Transfer To: ${toAccount}
Reason: ${reason}
Time: ${formattedTimestamp}

Please verify your account details and try again.

Best Regards,
The Banking Ledger Team
`

    const html = `
        <h2>Transaction Failed</h2>

        <p>Hello ${name},</p>

        <p>
            We were unable to process your transaction.
        </p>

        <ul>
            <li>
                <strong>Transaction ID:</strong>
                ${transactionId}
            </li>

            <li>
                <strong>Amount:</strong>
                ${currency} ${amount}
            </li>

            <li>
                <strong>Attempted Transfer To:</strong>
                ${toAccount}
            </li>

            <li>
                <strong>Reason:</strong>
                ${reason}
            </li>

            <li>
                <strong>Time:</strong>
                ${formattedTimestamp}
            </li>
        </ul>

        <p>
            Please verify your account details and try again.
        </p>

        <p>
            Best Regards,<br>
            The Banking Ledger Team
        </p>
    `

    return sendEmail(
        userEmail,
        subject,
        text,
        html
    )
}

module.exports = {
    verifyEmailService,
    sendEmail,
    sendRegistrationEmail,
    sendTransactionEmail,
    sendTransactionFailureEmail
}