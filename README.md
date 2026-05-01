# 🔐 Evnity Backend - Authentication System

Complete backend API for the Evnity Event Management Platform with authentication, OTP verification, and password management.

## 📋 Features Implemented

### ✅ F-1: Register Account

- Customer and Provider registration
- Input validation (email, phone, password strength)
- Automatic OTP generation and email sending
- Password hashing with bcrypt
- JWT token generation
- Provider account pending approval workflow

### ✅ F-2: Verify OTP

- Email verification with 6-digit OTP
- OTP expiration (10 minutes)
- Resend OTP functionality
- Rate limiting on OTP requests
- Welcome email after verification

### ✅ F-3: Login

- Secure email/password authentication
- JWT token generation (7-day expiry)
- Account status validation (blocked, inactive)
- Last login tracking
- Rate limiting on login attempts

### ✅ F-4: Logout

- Client-side token removal
- Server confirmation endpoint

### ✅ F-5: Forgot Password

- Password reset request via email
- Secure reset token generation
- Token expiration (30 minutes)
- Email with reset link
- Password strength validation

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- Git

### Installation

1. **Navigate to backend directory**

```bash
cd backend
```

2. **Install dependencies**

```bash
npm install
```

3. **Create .env file**

```bash
# Copy the example file
cp .env.example .env
```

4. **Configure .env file**
   Edit the `.env` file with your configuration:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/event_management

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRE=7d

# Email (Gmail example)
EMAIL_SERVICE=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_FROM=noreply@evnity.com

# Frontend
FRONTEND_URL=http://localhost:5174

# OTP
OTP_EXPIRE_MINUTES=10
```

5. **Start MongoDB**

```bash
# Windows
mongod

# macOS/Linux
sudo systemctl start mongod
```

6. **Create Admin Account**

```bash
npm run create-admin
```

Follow the prompts to create an admin account.

7. **Start the server**

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The server will start at `http://localhost:5000`

## 📡 API Endpoints

### Authentication Routes

| Method | Endpoint                          | Description            | Access  |
| ------ | --------------------------------- | ---------------------- | ------- |
| POST   | `/api/auth/register`              | Register new user      | Public  |
| POST   | `/api/auth/verify-otp`            | Verify email with OTP  | Private |
| POST   | `/api/auth/resend-otp`            | Resend OTP             | Private |
| POST   | `/api/auth/login`                 | User login             | Public  |
| POST   | `/api/auth/logout`                | User logout            | Private |
| POST   | `/api/auth/forgot-password`       | Request password reset | Public  |
| PUT    | `/api/auth/reset-password/:token` | Reset password         | Public  |
| GET    | `/api/auth/me`                    | Get current user       | Private |
| PUT    | `/api/auth/update-password`       | Update password        | Private |

### Payments (Testing Only)

This project supports:

- **Stripe (test mode)**: customer pays online via Stripe Checkout.
- **Pakistani manual methods**: customer pays manually (Easypaisa/JazzCash/Bank Transfer/Cash) and uploads a receipt.

There is also **Stripe Connect** so that:
- Providers connect their own Stripe account.
- Customers pay via Stripe.
- A configurable **platform fee percentage** goes to the admin, the rest to the provider.

#### Provider: set event payment options

Send `paymentOptions` in `POST /api/events` or `PUT /api/events/:id` (as JSON or JSON-string in multipart form):

```json
{
  "paymentOptions": {
    "stripe": { "enabled": true, "currency": "pkr" },
    "manual": {
      "enabled": true,
      "methods": [
        {
          "type": "easypaisa",
          "label": "Easypaisa",
          "accountTitle": "Provider Name",
          "accountNumber": "03XXXXXXXXX",
          "instructions": "Send payment and upload receipt on booking."
        }
      ]
    }
  }
}
```

#### Customer: Stripe checkout session

1) Provider accepts booking (`PUT /api/bookings/:id/accept`)

2) Customer creates Stripe Checkout session:

- **POST** `/api/payments/stripe/checkout-session` (Customer)

```json
{ "bookingId": "<booking_id>" }
```

Response includes `data.url` to redirect the customer to Stripe Checkout.

#### Provider: Stripe Connect (register Stripe account)

Endpoints (all require `Authorization: Bearer <provider_token>` except callback):

- **GET** `/api/providers/stripe/status`
  - Returns whether provider is connected to Stripe and basic account info.

- **GET** `/api/providers/stripe/connect-url`
  - Returns `{ data: { authUrl } }`.
  - Frontend should redirect provider to `authUrl` to complete Stripe onboarding.

- **GET** `/api/providers/stripe/callback?code=...&state=...`
  - Stripe redirects here after onboarding.
  - Backend links the Stripe account to the provider and redirects to:
    - `<FRONTEND_URL>/provider/settings/stripe?status=success|error&message=...`

- **POST** `/api/providers/stripe/disconnect`
  - Disconnects the provider’s Stripe account.

- **GET** `/api/providers/stripe/verify`
  - Returns `isReady: true/false` and message if Stripe account is not ready for charges.

On the **provider UI**:
- Before allowing the “Enable Stripe” toggle on the event form, check `/api/providers/stripe/status` or `/api/providers/stripe/verify`.
- If not connected / not ready, show a “Connect Stripe account” button that calls `/api/providers/stripe/connect-url` and redirects to `authUrl`.
- After redirect back, read `status` and `message` from query params and show success/error state.

#### Stripe webhook

- **POST** `/api/payments/stripe/webhook` (Stripe → server)

On `checkout.session.completed`, booking becomes `paymentStatus=paid` and (if already accepted) `status=confirmed`.

Additionally, the backend:
- Uses `PLATFORM_FEE_PERCENTAGE` (default 10%) to calculate:
  - `platformFee` (admin commission)
  - `providerPayout` (amount going to provider).
- Stores these on the booking for reporting:
  - `platformFeePercentage`, `platformFee`, `providerPayout`.

#### Customer: Manual payment receipt + confirmation

- **POST** `/api/bookings/:id/receipt` (multipart/form-data)
  - file field: `receipt`
  - optional fields: `methodType` (`easypaisa|jazzcash|bank_transfer|cash`), `transactionId`
- **PUT** `/api/bookings/:id/confirm` (Customer)

## 📝 API Usage Examples

### 1. Register Account

**Endpoint:** `POST /api/auth/register`

**Customer Registration:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "Password123",
  "phone": "03001234567",
  "city": "Lahore",
  "address": "Street 123, Lahore",
  "role": "customer"
}
```

**Provider Registration:**

```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "password": "Password123",
  "phone": "03009876543",
  "city": "Karachi",
  "address": "Main Street, Karachi",
  "role": "provider",
  "providerInfo": {
    "businessName": "Jane's Events",
    "description": "Professional event planning services",
    "experience": 5
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Registration successful! Please verify your email with the OTP sent to your email address.",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "65abc123...",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "customer",
      "isEmailVerified": false,
      ...
    }
  }
}
```

### 2. Verify OTP

**Endpoint:** `POST /api/auth/verify-otp`
**Headers:** `Authorization: Bearer <token>`

**Request:**

```json
{
  "otp": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Email verified successfully!",
  "data": {
    "isEmailVerified": true
  }
}
```

### 3. Login

**Endpoint:** `POST /api/auth/login`

**Request:**

```json
{
  "email": "john@example.com",
  "password": "Password123"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "65abc123...",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "customer",
      "isEmailVerified": true,
      ...
    }
  }
}
```

### 4. Forgot Password

**Endpoint:** `POST /api/auth/forgot-password`

**Request:**

```json
{
  "email": "john@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Password reset link sent to your email address"
}
```

### 5. Reset Password

**Endpoint:** `PUT /api/auth/reset-password/:resetToken`

**Request:**

```json
{
  "password": "NewPassword123"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Password reset successful. You can now login with your new password."
}
```

## 🔒 Security Features

- ✅ Password hashing with bcrypt (10 salt rounds)
- ✅ JWT authentication with expiration
- ✅ Rate limiting on authentication routes
- ✅ Input validation with express-validator
- ✅ MongoDB injection prevention
- ✅ XSS protection
- ✅ Helmet security headers
- ✅ CORS configuration
- ✅ OTP expiration (10 minutes)
- ✅ Password reset token expiration (30 minutes)

## 📧 Email Configuration

### Gmail Setup

1. Enable 2-Factor Authentication in your Google Account
2. Generate an App Password:
   - Go to Google Account Settings
   - Security → 2-Step Verification → App passwords
   - Generate password for "Mail"
3. Use the generated password in `.env`:

```env
EMAIL_SERVICE=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=generated_app_password
```

## 🧪 Testing

### Using cURL

**Register:**

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "Test123",
    "phone": "03001234567",
    "city": "Lahore",
    "role": "customer"
  }'
```

**Login:**

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123"
  }'
```

### Using Postman

1. Import the API collection (create one from endpoints above)
2. Set environment variable `{{baseURL}}` = `http://localhost:5000/api`
3. After login, save the token in environment variable `{{token}}`
4. Use `{{token}}` in Authorization header for protected routes

## 🗂️ Project Structure

```
backend/
├── config/
│   └── db.js                 # MongoDB connection
├── controllers/
│   └── authController.js     # Authentication logic
├── middleware/
│   ├── auth.js              # JWT verification
│   ├── validation.js        # Input validation
│   ├── errorHandler.js      # Error handling
│   └── rateLimiter.js       # Rate limiting
├── models/
│   └── User.js              # User schema
├── routes/
│   └── authRoutes.js        # Auth endpoints
├── scripts/
│   └── createAdmin.js       # Admin creation script
├── utils/
│   └── emailService.js      # Email sending
├── .env.example             # Environment template
├── .gitignore              # Git ignore rules
├── package.json            # Dependencies
└── server.js               # Entry point
```

## 🐛 Troubleshooting

### MongoDB Connection Error

```bash
Error: connect ECONNREFUSED 127.0.0.1:27017
```

**Solution:** Make sure MongoDB is running:

```bash
# Windows
mongod

# macOS/Linux
sudo systemctl start mongod
```

### Email Not Sending

**Solution:**

1. Check email credentials in `.env`
2. Enable "Less secure app access" or use App Password for Gmail
3. Check console for email errors

### Port Already in Use

```bash
Error: listen EADDRINUSE :::5000
```

**Solution:** Change PORT in `.env` or kill the process using port 5000

## 📊 Database Schema

### User Model

```javascript
{
  name: String (required, 2-100 chars),
  email: String (required, unique, validated),
  password: String (required, hashed, min 6 chars),
  phone: String (required, Pakistani format),
  role: String (customer|provider|admin),
  city: String (required),
  address: String,
  avatar: String,

  providerInfo: {
    businessName: String,
    description: String,
    experience: Number,
    isVerified: Boolean,
    verificationStatus: String (pending|approved|rejected),
    rejectionReason: String
  },

  isActive: Boolean,
  isEmailVerified: Boolean,
  isBlocked: Boolean,
  otp: String (hashed),
  otpExpire: Date,
  resetPasswordToken: String (hashed),
  resetPasswordExpire: Date,
  lastLogin: Date,

  timestamps: true
}
```

## 🔄 Integration with Frontend

The backend is fully integrated with the frontend. The frontend should:

1. **Store token in localStorage:**

```javascript
localStorage.setItem("token", data.data.token);
localStorage.setItem("user", JSON.stringify(data.data.user));
```

2. **Include token in requests:**

```javascript
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

3. **Handle token expiration:**

```javascript
if (error.message === "Invalid or expired token") {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  navigate("/login");
}
```

## 📝 Admin Account

Default admin credentials (if created with defaults):

- **Email:** admin@evnity.com
- **Password:** Admin@123456

⚠️ **IMPORTANT:** Change the password immediately after first login!

## 🚀 Deployment

### Environment Variables

Set these in your production environment:

- `NODE_ENV=production`
- `MONGODB_URI` (production database)
- `JWT_SECRET` (strong random string)
- Email credentials
- `FRONTEND_URL` (production frontend URL)

### Security Checklist

- ✅ Use strong JWT_SECRET
- ✅ Enable HTTPS
- ✅ Set secure CORS origins
- ✅ Use environment-specific database
- ✅ Enable MongoDB authentication
- ✅ Set up proper logging
- ✅ Configure rate limits appropriately

## 📞 Support

For issues or questions:

- Check the troubleshooting section
- Review the API examples
- Check server logs for errors

## 🎉 Success!

If you see this message when starting the server:

```
🚀 Evnity Backend Server Started!
📡 Server running in development mode
🌐 Port: 5000
✅ MongoDB Connected: localhost
```

You're all set! The backend is ready to use.
