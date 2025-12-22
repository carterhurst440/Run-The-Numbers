# Forgot Password Setup Guide

This guide explains how to configure the forgot password / password reset functionality in your Run the Numbers application.

## Features Implemented

1. **Forgot Password Link**: Added to the login page, allows users to request a password reset
2. **Email Reset Request Page**: Dedicated view where users enter their email to receive a reset link
3. **Password Reset Page**: Authenticated page where users can set their new password after clicking the email link
4. **Supabase Integration**: Uses Supabase's built-in password reset flow with email templates

## Frontend Changes

### 1. New Views Added

**Forgot Password View** (`#/forgot-password`):
- Email input field
- "Send Reset Link" button
- Success/error message display
- "Back to Log In" link

**Reset Password View** (`#/reset-password`):
- New password input
- Confirm password input
- "Update Password" button
- Password validation (minimum 6 characters, passwords must match)

### 2. Navigation Flow

```
Login Page
  ↓ (Click "Forgot password?")
Forgot Password Page
  ↓ (Enter email → "Send Reset Link")
Email Sent Confirmation
  ↓ (User clicks link in email)
Reset Password Page
  ↓ (Enter new password → "Update Password")
Home Page (logged in)
```

### 3. Authentication Events

The app now handles the `PASSWORD_RECOVERY` event from Supabase, which is triggered when a user clicks the reset link in their email. This automatically redirects them to the `#/reset-password` view.

## Supabase Configuration

### Step 1: Configure Email Templates

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Email Templates**
3. Select **Reset Password** template
4. Update the template to include a link back to your application:

**Recommended Template:**

```html
<h2>Reset Your Password</h2>
<p>Click the link below to reset your password for Run the Numbers:</p>
<p><a href="{{ .SiteURL }}/auth/v1/verify?token={{ .TokenHash }}&type=recovery&redirect_to={{ .RedirectTo }}">Reset Password</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>
<p>This link expires in 1 hour.</p>
```

### Step 2: Configure Site URL (Important!)

The password reset flow requires your site URL to be properly configured:

1. In Supabase Dashboard, go to **Authentication** → **URL Configuration**
2. Set **Site URL** to your application's URL:
   - For local development: `http://localhost:8000` (or your local port)
   - For production: `https://yourdomain.com`
3. Add your URL to **Redirect URLs** (same as Site URL)

### Step 3: Email Provider Configuration

Make sure you have email delivery configured:

1. Go to **Authentication** → **Email Settings**
2. Choose your email provider:
   - **SendGrid** (recommended for production)
   - **SMTP** (custom email server)
   - **Supabase default** (works for testing, limited to 4 emails/hour)

For production, it's strongly recommended to set up SendGrid or another email service to ensure reliable delivery.

## Testing the Flow

### Local Development Testing

1. **Test Forgot Password Request**:
   ```
   - Navigate to login page
   - Click "Forgot password?"
   - Enter a test user's email
   - Click "Send Reset Link"
   - Check console for any errors
   ```

2. **Test Email Delivery**:
   ```
   - Check the test user's email inbox
   - Look for "Reset Your Password" email from Supabase
   - If using Supabase's default emails, check spam folder
   ```

3. **Test Password Reset**:
   ```
   - Click the reset link in the email
   - Should redirect to /#/reset-password
   - Enter new password (min 6 characters)
   - Confirm the password matches
   - Click "Update Password"
   - Should see success message and redirect to home
   ```

4. **Test Login with New Password**:
   ```
   - Sign out
   - Log in with the new password
   - Should successfully authenticate
   ```

### Production Testing

Before going live, test the complete flow in production:

1. Create a test account in production
2. Use the forgot password flow with a real email address
3. Verify email arrives promptly (not in spam)
4. Complete the password reset
5. Confirm you can log in with the new password

## Troubleshooting

### Email not received

1. **Check Supabase email quota**:
   - Free tier: Limited emails per hour
   - Solution: Configure SendGrid or SMTP provider

2. **Check spam folder**:
   - Supabase default emails often go to spam
   - Solution: Set up custom email provider with proper SPF/DKIM

3. **Check Site URL configuration**:
   - Must match your application URL exactly
   - Should not have trailing slash

### Reset link doesn't work

1. **Link expired**:
   - Reset links expire after 1 hour
   - Request a new reset email

2. **Wrong redirect URL**:
   - Check that `redirectTo` parameter matches your configured redirect URLs
   - Update the Site URL in Supabase settings

3. **Browser console errors**:
   - Open browser DevTools console
   - Look for JavaScript errors
   - Check Network tab for failed API calls

### Password update fails

1. **Password too short**:
   - Minimum 6 characters required
   - Shows error message to user

2. **Passwords don't match**:
   - Confirm password must match new password
   - Client-side validation shows error

3. **Session expired**:
   - Reset link may have expired
   - Request new reset email

### Not redirecting to reset-password page

1. **Check auth state handler**:
   - Look for `PASSWORD_RECOVERY` event in console logs
   - Verify `onAuthStateChange` is registered

2. **Hash routing issue**:
   - Ensure URL has `#/reset-password` after clicking email link
   - Check that `AUTH_ROUTES` includes "reset-password"

## Security Considerations

1. **Rate Limiting**: Supabase automatically rate-limits password reset requests to prevent abuse
2. **Token Expiration**: Reset links expire after 1 hour for security
3. **Single Use**: Each reset link can only be used once
4. **Password Requirements**: Minimum 6 characters (can be increased in validation)

## Code Structure

### Files Modified

1. **index.html**:
   - Added `forgot-password-view` section
   - Added `reset-password-view` section
   - Added "Forgot password?" link to login form

2. **script.js**:
   - Added `handleForgotPasswordSubmit()` function
   - Added `handleResetPasswordSubmit()` function
   - Updated `AUTH_ROUTES` to include new routes
   - Updated `showAuthView()` to handle new views
   - Updated `setRoute()` to display correct auth view
   - Updated `onAuthStateChange()` to handle `PASSWORD_RECOVERY` event
   - Added DOM references for new form elements

3. **styles.css**:
   - Added `.auth-success` class for success messages
   - Added `.auth-description` class for explanatory text

## Customization

### Change Password Requirements

Edit `handleResetPasswordSubmit()` in `script.js`:

```javascript
if (password.length < 8) {  // Change from 6 to 8
  if (resetPasswordErrorEl) {
    resetPasswordErrorEl.hidden = false;
    resetPasswordErrorEl.textContent = "Password must be at least 8 characters.";
  }
  return;
}
```

### Customize Email Template Text

In Supabase Dashboard → Authentication → Email Templates, you can customize:
- Email subject line
- Email body text and HTML
- Button styling
- Footer content

### Change Success Message Duration

After password reset, the user is redirected to home. To add a delay:

```javascript
showToast("Password updated successfully", "success");

// Wait 2 seconds before redirecting
setTimeout(async () => {
  await setRoute("home");
}, 2000);
```

## Support

If you encounter issues not covered in this guide:

1. Check Supabase Dashboard → Logs for API errors
2. Check browser console for JavaScript errors
3. Verify email provider settings in Supabase
4. Test with a different email address
5. Review Supabase authentication documentation: https://supabase.com/docs/guides/auth
