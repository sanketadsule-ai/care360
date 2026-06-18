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
  FB_APP_ID: '910067414827041',

  FB_API_VERSION: 'v25.0',

  // Permissions requested at login. pages_read_engagement lets us read
  // a page's posts & comments; pages_show_list lists the pages you manage.
  FB_SCOPES: 'public_profile,pages_show_list,pages_read_engagement',
};
