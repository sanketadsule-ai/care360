/**
 * Carapal360 — Configuration
 *
 * SETUP (one time):
 *  1. Go to https://developers.facebook.com/apps  → "Create App" → type "Business".
 *  2. Add the product "Facebook Login for Business".
 *  3. In Facebook Login → Settings → "Valid OAuth Redirect URIs", add
 *     your app's URL (e.g. https://your-app.vercel.app/).
 *  4. In App Settings → Basic → "App Domains", add your domain
 *     (e.g. your-app.vercel.app).
 *  5. Copy your App ID from the app dashboard and paste it below.
 *  6. Deploy to Vercel or any HTTPS host, then open in a browser.
 *
 * NOTE: While your app is in "Development" mode you can only read data for
 * Facebook accounts/pages that are added as Admins/Developers/Testers of the app.
 * Reading other people's pages needs Facebook App Review (production step).
 */
window.CARAPAL_CONFIG = {
  // 👇 PASTE YOUR FACEBOOK APP ID HERE
  FB_APP_ID: '1000563233479492',

  // 👇 PASTE YOUR GOOGLE OAUTH CLIENT ID HERE (e.g. 'xxxx.apps.googleusercontent.com')

  FB_API_VERSION: 'v25.0',

  // Permissions requested at login. pages_read_engagement lets us read
  // a page's posts & comments; pages_show_list lists the pages you manage.
  FB_SCOPES: 'pages_show_list,pages_read_engagement',

  // ── INSTAGRAM CONFIG ──────────────────────────────
  // Instagram uses the exact same FB_APP_ID, just different scopes.
  IG_SCOPES: 'instagram_basic,instagram_manage_comments,instagram_business_manage_messages,pages_show_list,pages_read_engagement',

  // ── GOOGLE PLAY STORE CONFIG ──────────────────────
  // 1. Go to Google Cloud Console (https://console.cloud.google.com)
  // 2. Create Project -> APIs & Services -> Credentials
  // 3. Create OAuth Client ID (Web Application)
  // 4. Add your Vercel URL to "Authorized JavaScript origins" and "Authorized redirect URIs"
  // 👇 PASTE YOUR GOOGLE CLIENT ID HERE
  GOOGLE_CLIENT_ID: '282172866930-91vun3ocj044bnfft49lb2f17f95beun.apps.googleusercontent.com',

  // Ensure this EXACTLY matches the "Authorized redirect URIs" in Google Cloud Console
  // Notice there is NO trailing slash here!
  GOOGLE_REDIRECT_URI: 'https://sanketadsule-ai-carepal360-ouz4.vercel.app',

  // Scopes needed to read and reply to Play Store app reviews
  GOOGLE_SCOPES: 'https://www.googleapis.com/auth/androidpublisher',

  // ── TWITTER CONFIG ───────────────────────────────
  // 1. Go to Twitter Developer Portal (https://developer.twitter.com/en/portal/dashboard)
  // 2. Create a Web App, enable OAuth 2.0 with PKCE.
  // 3. Set the Redirect URL to your deployed twitter_auth.html or localhost.
  TWITTER_CLIENT_ID: 'VzYzT0JlSzJOaFI2RHV3Wldsb3A6MTpjaQ',

  // Scopes needed for Twitter API v2

  // Update this to match your production domain when deploying
  TWITTER_REDIRECT_URI: 'https://sanketadsule-ai-carepal360-ouz4.vercel.app/twitter_auth.html',
  TWITTER_SCOPES: 'tweet.read tweet.write users.read offline.access'
};