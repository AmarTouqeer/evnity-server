const nodemailer = require("nodemailer");

const getTransporter = () => {
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

// Send OTP email
exports.sendOTPEmail = async (email, otp, name) => {
  try {
    const mailOptions = {
      from: `"Evnity" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify Your Email - Evnity",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #B7410E 0%, #D7490C 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-box { background: white; border: 2px dashed #D7490C; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
            .otp-code { font-size: 32px; font-weight: bold; color: #D7490C; letter-spacing: 5px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .button { background: linear-gradient(135deg, #B7410E 0%, #D7490C 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1> Welcome to Evnity!</h1>
            </div>
            <div class="content">
              <h2>Hello ${name}!</h2>
              <p>Thank you for registering with Evnity. Please verify your email address to complete your registration.</p>
              
              <div class="otp-box">
                <p style="margin: 0; color: #666;">Your verification code is:</p>
                <div class="otp-code">${otp}</div>
                <p style="margin: 10px 0 0 0; color: #999; font-size: 14px;">This code will expire in 10 minutes</p>
              </div>

              <p>If you didn't request this verification, please ignore this email.</p>
              
              <p style="margin-top: 30px;">Best regards,<br><strong>Evnity Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Evnity. All rights reserved.</p>
              <p>Event Management Platform - Pakistan</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(` OTP email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending OTP email:", error);
    return false;
  }
};

// Send password reset email
exports.sendPasswordResetEmail = async (email, resetToken, name) => {
  try {
    // Get the first frontend URL from comma-separated list
    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173")
      .split(",")[0]
      .trim();
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    const mailOptions = {
      from: `"Evnity" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: "Password Reset Request - Evnity",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #B7410E 0%, #D7490C 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { background: linear-gradient(135deg, #B7410E 0%, #D7490C 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1> Password Reset Request</h1>
            </div>
            <div class="content">
              <h2>Hello ${name}!</h2>
              <p>You have requested to reset your password. Click the button below to reset it:</p>
              
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>

              <p style="margin-top: 20px;">Or copy and paste this link in your browser:</p>
              <p style="background: white; padding: 10px; border-radius: 5px; word-break: break-all;">${resetUrl}</p>

              <p style="color: #d9534f; margin-top: 20px;"><strong>⚠️ This link will expire in 30 minutes.</strong></p>

              <p>If you didn't request this password reset, please ignore this email or contact support if you have concerns.</p>
              
              <p style="margin-top: 30px;">Best regards,<br><strong>Evnity Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Evnity. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error(" Error sending password reset email:", error);
    return false;
  }
};

// Send welcome email
exports.sendWelcomeEmail = async (email, name, role) => {
  try {
    const mailOptions = {
      from: `"Evnity" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: "Welcome to Evnity! 🎉",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #B7410E 0%, #D7490C 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to Evnity!</h1>
            </div>
            <div class="content">
              <h2>Hello ${name}!</h2>
              <p>Your account has been successfully verified and you're all set to start using Evnity!</p>
              
              ${
                role === "provider"
                  ? "<p><strong>Note:</strong> As a provider, your account is pending admin verification. You will be able to create listings once approved.</p>"
                  : "<p>Start exploring events, services, and resources available in your area!</p>"
              }

              <p>If you have any questions or need assistance, feel free to contact our support team.</p>
              
              <p style="margin-top: 30px;">Best regards,<br><strong>Evnity Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Evnity. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(` Welcome email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending welcome email:", error);
    return false;
  }
};

// Send approval email
exports.sendApprovalEmail = async (email, name, type) => {
  try {
    const mailOptions = {
      from: `"Evnity" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: `Your ${type} has been approved! `,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #B7410E 0%, #D7490C 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Approval Confirmed!</h1>
            </div>
            <div class="content">
              <h2>Hello ${name}!</h2>
              <p>Great news! Your ${type} has been approved by our admin team.</p>
              <p>Your listing is now live and visible to customers.</p>
              <p>If you have any questions, feel free to contact our support team.</p>
              <p style="margin-top: 30px;">Best regards,<br><strong>Evnity Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Evnity. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(` Approval email sent to ${email}`);
    return true;
  } catch (error) {
    console.error(" Error sending approval email:", error);
    return false;
  }
};

// Send rejection email
exports.sendRejectionEmail = async (email, name, type, reason) => {
  try {
    const mailOptions = {
      from: `"Evnity" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: `Your ${type} submission requires attention`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #B7410E 0%, #D7490C 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .reason-box { background: white; border-left: 4px solid #d9534f; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1> Submission Update</h1>
            </div>
            <div class="content">
              <h2>Hello ${name}!</h2>
              <p>We regret to inform you that your ${type} submission has been rejected.</p>
              <div class="reason-box">
                <p><strong>Reason:</strong></p>
                <p>${reason}</p>
              </div>
              <p>Please review the feedback and resubmit your ${type} with the necessary changes.</p>
              <p>If you have any questions, feel free to contact our support team.</p>
              <p style="margin-top: 30px;">Best regards,<br><strong>Evnity Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Evnity. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`Rejection email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending rejection email:", error);
    return false;
  }
};

// Send booking confirmation email
exports.sendBookingConfirmationEmail = async (
  email,
  name,
  bookingDetails
) => {
  try {
    const mailOptions = {
      from: `"Evnity" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: "Booking Confirmation - Evnity",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #B7410E 0%, #D7490C 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .booking-details { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Booking Confirmed!</h1>
            </div>
            <div class="content">
              <h2>Hello ${name}!</h2>
              <p>Your booking has been confirmed. Here are the details:</p>
              <div class="booking-details">
                <p><strong>Type:</strong> ${bookingDetails.type}</p>
                <p><strong>Date:</strong> ${new Date(
                  bookingDetails.eventDate
                ).toLocaleDateString()}</p>
                <p><strong>Time:</strong> ${bookingDetails.startTime} - ${
        bookingDetails.endTime
      }</p>
                <p><strong>Total Amount:</strong> Rs. ${bookingDetails.totalAmount}</p>
              </div>
              <p>Thank you for using Evnity!</p>
              <p style="margin-top: 30px;">Best regards,<br><strong>Evnity Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Evnity. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(` Booking confirmation email sent to ${email}`);
    return true;
  } catch (error) {
    console.error(" Error sending booking confirmation email:", error);
    return false;
  }
};

// Send booking status update email
exports.sendBookingStatusEmail = async (email, name, status, bookingDetails) => {
  try {
    const statusMessages = {
      booking_created: "New Booking Request",
      booking_accepted: "Booking Accepted",
      booking_rejected: "Booking Rejected",
      booking_confirmed: "Booking Confirmed",
      booking_cancelled: "Booking Cancelled",
      booking_completed: "Booking Completed",
    };

    const mailOptions = {
      from: `"Evnity" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: `${statusMessages[status]} - Evnity`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #B7410E 0%, #D7490C 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .booking-details { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${statusMessages[status]}</h1>
            </div>
            <div class="content">
              <h2>Hello ${name}!</h2>
              <p>Your booking status has been updated.</p>
              <div class="booking-details">
                <p><strong>Status:</strong> ${statusMessages[status]}</p>
                ${bookingDetails ? `<p><strong>Type:</strong> ${bookingDetails.type}</p>` : ""}
                ${bookingDetails ? `<p><strong>Date:</strong> ${new Date(bookingDetails.eventDate).toLocaleDateString()}</p>` : ""}
              </div>
              <p>Thank you for using Evnity!</p>
              <p style="margin-top: 30px;">Best regards,<br><strong>Evnity Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Evnity. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(` Booking status email sent to ${email}`);
    return true;
  } catch (error) {
    console.error(" Error sending booking status email:", error);
    return false;
  }
};