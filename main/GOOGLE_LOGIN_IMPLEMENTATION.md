# Google Login Implementation for LilChat

## Overview
Implemented Google Sign-In authentication using Firebase's Google Auth Provider for LilChat extension.

## Changes Made

### 1. **background.js** - Google Auth Setup
- Added Google Auth Provider initialization
- Created `case "GOOGLE_LOGIN"` handler in the message listener
- Supports both popup and redirect auth flows
- Automatically creates new user profiles from Google data
- Updates existing user profiles with Google profile picture

```javascript
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');
```

#### Key Features:
- **Popup Flow (Primary)**: `auth.signInWithPopup(googleProvider)` - Opens a popup for Google login
- **Redirect Flow (Fallback)**: If popup fails, falls back to `signInWithRedirect()`
- **User Data Mapping**:
  - `displayName` → nickname (with fallback to email prefix)
  - `email` → stored in user profile
  - `photoURL` → profilePicture
  - `uid` → userId

#### Database Integration:
- Checks if user exists in Firebase Realtime Database
- Creates new user entry with Google profile data if new
- Updates profile picture for existing users if missing

### 2. **sidepanel.js** - Google Login UI

#### Added Functions:
- `showGoogleLoginButton()` - Creates styled Google login button
  - Displays when user is on login screen
  - Styled with Google brand colors (blue/red gradient)
  - Hover animations for better UX

- `handleGoogleLogin()` - Processes Google login
  - Shows "Iniciando login com Google..." message
  - Handles both popup and redirect flows
  - For redirect flow: polls for auth state changes (up to 30 seconds)
  - Loads chat screen on successful authentication

#### UI Updates:
- Added button to login tutorial (`showLoginTutorial()`)
- Added button to login help (`showLoginHelp()`)
- Google button appears with message "🔐 Logar com Google"

### 3. **Authentication Flow**

#### Popup Flow (Normal):
```
User clicks "Logar com Google"
↓
Button displays "Iniciando login com Google..."
↓
signInWithPopup() opens Google OAuth popup
↓
User signs in with Google
↓
Background service worker receives user data
↓
Creates/Updates user in database
↓
Response returns to sidepanel
↓
Chat screen loads with user data
```

#### Redirect Flow (Fallback):
```
signInWithPopup() fails
↓
signInWithRedirect() initiated
↓
Auth state stored in localStorage
↓
onAuthStateChanged() listener catches auth
↓
Sidepanel polls GET_ALL_DATA every second
↓
Detects logged-in user
↓
Chat screen loads
```

## Configuration Required

### Firebase Console Setup:
1. Go to Firebase Console → Authentication
2. Enable Google as a sign-in provider
3. Add your Chrome extension domain to authorized redirect URIs
   - Format: `chrome-extension://your-extension-id/`

### Manifest Permissions:
Already configured in `manifest.json`:
- `storage` - for storing user info
- No additional permissions needed for Google Auth

## User Experience

### Login Screen Changes:
- Tutorial now mentions "Ou clique em 'Logar com Google' abaixo!"
- Google button appears after tutorial (3.5s delay)
- Button is always visible in `/help`

### Google Account Features:
- Auto-fills nickname from Google display name
- Auto-sets profile picture from Google account
- Seamless account creation for first-time users
- Existing users get profile picture update if missing

## Error Handling
- Gracefully handles popup blockers (falls back to redirect)
- Handles auth timeout (30-second limit for redirect flow)
- Shows user-friendly error messages
- Logs errors to console for debugging

## Testing

### Test Cases:
1. **First-time Google login**: Should create new account with Google profile data
2. **Existing user Google login**: Should load existing account data
3. **Popup blocker**: Should fallback to redirect auth
4. **Auth timeout**: Should show timeout message after 30 seconds

### Test Users:
- Use any Google account for testing
- Check Firebase Realtime Database → users → [uid] for data

## Security Notes
- Google OAuth is handled securely by Firebase
- No credentials are stored in extension code
- All auth data is stored in Chrome's secure storage
- Redirect flow uses Firebase secure redirect mechanism

## Browser Compatibility
- Chrome/Edge (Service Workers support)
- Works with extension context (not content scripts)
- Requires Manifest V3

## Future Improvements
- Add Google profile picture display in chat
- Add "Sign out and switch account" option
- Support other OAuth providers (GitHub, Discord, etc.)
- Add social features using Google data
