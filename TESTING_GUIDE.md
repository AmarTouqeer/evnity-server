# 🧪 Testing Guide - Evnity Authentication API

Complete guide for testing all authentication functionalities.

## 📋 Test Scenarios

### Setup

1. Start MongoDB
2. Start backend server: `npm run dev`
3. Backend should be running at `http://localhost:5000`

## ✅ Test F-1: Register Account

### Test 1.1: Customer Registration (Success)

**Request:**

```http
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "name": "John Customer",
  "email": "customer@test.com",
  "password": "Customer123",
  "phone": "03001234567",
  "city": "Lahore",
  "address": "123 Main Street, Lahore",
  "role": "customer"
}
```

**Expected Response (201):**

```json
{
  "success": true,
  "message": "Registration successful! Please verify your email with the OTP sent to your email address.",
  "data": {
    "token": "eyJhbGc...",
    "user": {
      "_id": "...",
      "name": "John Customer",
      "email": "customer@test.com",
      "role": "customer",
      "isEmailVerified": false
    }
  }
}
```

**Verify:**

- ✅ User created in database
- ✅ Token generated
- ✅ OTP email sent (check email or logs)
- ✅ Password is hashed in database

### Test 1.2: Provider Registration (Success)

**Request:**

```http
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "name": "Jane Provider",
  "email": "provider@test.com",
  "password": "Provider123",
  "phone": "03009876543",
  "city": "Karachi",
  "address": "456 Business Street, Karachi",
  "role": "provider",
  "providerInfo": {
    "businessName": "Jane's Event Planning",
    "description": "Professional event planning services with 5 years of experience",
    "experience": 5
  }
}
```

**Expected Response (201):**

```json
{
  "success": true,
  "message": "Registration successful!...",
  "data": {
    "token": "...",
    "user": {
      "role": "provider",
      "providerInfo": {
        "businessName": "Jane's Event Planning",
        "isVerified": false,
        "verificationStatus": "pending"
      }
    }
  }
}
```

**Verify:**

- ✅ Provider info saved
- ✅ Verification status is "pending"
- ✅ isVerified is false

### Test 1.3: Duplicate Email (Error)

**Request:**

```http
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "name": "Another User",
  "email": "customer@test.com",
  "password": "Test123",
  "phone": "03001111111",
  "city": "Lahore",
  "role": "customer"
}
```

**Expected Response (400):**

```json
{
  "success": false,
  "message": "User with this email already exists"
}
```

### Test 1.4: Invalid Email (Validation Error)

**Request:**

```http
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "name": "Test User",
  "email": "invalid-email",
  "password": "Test123",
  "phone": "03001234567",
  "city": "Lahore"
}
```

**Expected Response (400):**

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Please provide a valid email address"
    }
  ]
}
```

### Test 1.5: Weak Password (Validation Error)

**Request:**

```http
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "name": "Test User",
  "email": "test@test.com",
  "password": "weak",
  "phone": "03001234567",
  "city": "Lahore"
}
```

**Expected Response (400):**

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "password",
      "message": "Password must be at least 6 characters"
    }
  ]
}
```

### Test 1.6: Invalid Phone (Validation Error)

**Request:**

```http
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "name": "Test User",
  "email": "test2@test.com",
  "password": "Test123",
  "phone": "1234567890",
  "city": "Lahore"
}
```

**Expected Response (400):**

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "phone",
      "message": "Please provide a valid Pakistani phone number (03XXXXXXXXX)"
    }
  ]
}
```

## ✅ Test F-2: Verify OTP

### Test 2.1: Valid OTP (Success)

**Note:** Get the OTP from email or check server logs for the generated OTP

**Request:**

```http
POST http://localhost:5000/api/auth/verify-otp
Content-Type: application/json
Authorization: Bearer <token_from_registration>

{
  "otp": "123456"
}
```

**Expected Response (200):**

```json
{
  "success": true,
  "message": "Email verified successfully!",
  "data": {
    "isEmailVerified": true
  }
}
```

**Verify:**

- ✅ User's isEmailVerified is true
- ✅ OTP and otpExpire fields cleared
- ✅ Welcome email sent

### Test 2.2: Invalid OTP (Error)

**Request:**

```http
POST http://localhost:5000/api/auth/verify-otp
Authorization: Bearer <token>

{
  "otp": "000000"
}
```

**Expected Response (400):**

```json
{
  "success": false,
  "message": "Invalid OTP. Please try again."
}
```

### Test 2.3: Expired OTP (Error)

**Note:** Wait 10 minutes after registration or manually set otpExpire to past time in database

**Expected Response (400):**

```json
{
  "success": false,
  "message": "OTP has expired. Please request a new OTP."
}
```

### Test 2.4: Resend OTP (Success)

**Request:**

```http
POST http://localhost:5000/api/auth/resend-otp
Authorization: Bearer <token>
```

**Expected Response (200):**

```json
{
  "success": true,
  "message": "OTP sent successfully to your email address"
}
```

**Verify:**

- ✅ New OTP generated
- ✅ New OTP email sent
- ✅ New expiration time set

## ✅ Test F-3: Login

### Test 3.1: Valid Login (Success)

**Request:**

```http
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "customer@test.com",
  "password": "Customer123"
}
```

**Expected Response (200):**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGc...",
    "user": {
      "_id": "...",
      "name": "John Customer",
      "email": "customer@test.com",
      "role": "customer",
      "lastLogin": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Verify:**

- ✅ Token generated
- ✅ User data returned
- ✅ lastLogin updated in database

### Test 3.2: Invalid Email (Error)

**Request:**

```http
POST http://localhost:5000/api/auth/login

{
  "email": "nonexistent@test.com",
  "password": "Test123"
}
```

**Expected Response (401):**

```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

### Test 3.3: Invalid Password (Error)

**Request:**

```http
POST http://localhost:5000/api/auth/login

{
  "email": "customer@test.com",
  "password": "WrongPassword123"
}
```

**Expected Response (401):**

```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

### Test 3.4: Rate Limiting (Error)

**Note:** Make 6 login attempts within 15 minutes

**Expected Response (429):**

```json
{
  "success": false,
  "message": "Too many authentication attempts, please try again later."
}
```

## ✅ Test F-4: Logout

### Test 4.1: Logout (Success)

**Request:**

```http
POST http://localhost:5000/api/auth/logout
Authorization: Bearer <token>
```

**Expected Response (200):**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Verify:**

- ✅ Client removes token from localStorage
- ✅ Subsequent requests with same token should still work (stateless JWT)

## ✅ Test F-5: Forgot Password

### Test 5.1: Request Password Reset (Success)

**Request:**

```http
POST http://localhost:5000/api/auth/forgot-password
Content-Type: application/json

{
  "email": "customer@test.com"
}
```

**Expected Response (200):**

```json
{
  "success": true,
  "message": "Password reset link sent to your email address"
}
```

**Verify:**

- ✅ Reset token generated and hashed
- ✅ Reset token expiry set (30 minutes)
- ✅ Password reset email sent

### Test 5.2: Invalid Email (Error)

**Request:**

```http
POST http://localhost:5000/api/auth/forgot-password

{
  "email": "nonexistent@test.com"
}
```

**Expected Response (404):**

```json
{
  "success": false,
  "message": "No user found with this email address"
}
```

### Test 5.3: Reset Password (Success)

**Note:** Get reset token from email

**Request:**

```http
PUT http://localhost:5000/api/auth/reset-password/<reset_token>
Content-Type: application/json

{
  "password": "NewPassword123"
}
```

**Expected Response (200):**

```json
{
  "success": true,
  "message": "Password reset successful. You can now login with your new password."
}
```

**Verify:**

- ✅ Password changed in database
- ✅ Reset token cleared
- ✅ Can login with new password

### Test 5.4: Invalid/Expired Token (Error)

**Request:**

```http
PUT http://localhost:5000/api/auth/reset-password/invalid_token

{
  "password": "NewPassword123"
}
```

**Expected Response (400):**

```json
{
  "success": false,
  "message": "Invalid or expired reset token"
}
```

## 🔐 Additional Tests

### Test: Get Current User (Protected Route)

**Request:**

```http
GET http://localhost:5000/api/auth/me
Authorization: Bearer <token>
```

**Expected Response (200):**

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "...",
      "name": "John Customer",
      "email": "customer@test.com",
      "role": "customer"
    }
  }
}
```

### Test: Update Password

**Request:**

```http
PUT http://localhost:5000/api/auth/update-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "Customer123",
  "newPassword": "NewCustomer123"
}
```

**Expected Response (200):**

```json
{
  "success": true,
  "message": "Password updated successfully"
}
```

## 📊 Test Checklist

### Registration

- ✅ Customer registration with valid data
- ✅ Provider registration with business info
- ✅ Duplicate email rejection
- ✅ Email validation
- ✅ Password strength validation
- ✅ Phone number validation
- ✅ OTP generation and email sending

### OTP Verification

- ✅ Valid OTP verification
- ✅ Invalid OTP rejection
- ✅ Expired OTP handling
- ✅ Resend OTP functionality
- ✅ Welcome email after verification

### Login

- ✅ Valid credentials login
- ✅ Invalid email rejection
- ✅ Invalid password rejection
- ✅ Rate limiting
- ✅ Last login tracking

### Logout

- ✅ Successful logout response

### Password Reset

- ✅ Forgot password request
- ✅ Reset email sending
- ✅ Password reset with valid token
- ✅ Invalid token rejection
- ✅ Expired token handling

## 🛠️ Testing Tools

### Recommended Tools

1. **Postman** - GUI-based API testing
2. **Thunder Client** - VS Code extension
3. **cURL** - Command-line testing
4. **REST Client** - VS Code extension

### Quick cURL Tests

**Register:**

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@test.com","password":"Test123","phone":"03001234567","city":"Lahore","role":"customer"}'
```

**Login:**

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123"}'
```

## 🎯 Expected Outcomes

After running all tests:

- All 5 main functionalities working
- Proper error handling
- Security measures active
- Email notifications sent
- Database records correct
- Frontend integration ready

## 📝 Notes

- Save tokens for subsequent requests
- Check email inbox or server logs for OTPs and reset links
- Rate limiting resets after the time window
- OTPs expire in 10 minutes
- Reset tokens expire in 30 minutes
