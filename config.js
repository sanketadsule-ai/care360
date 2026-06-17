/**
 * Carapal360 — Configuration
 *
 * SETUP (one time):
 *  1. Go to https://developers.facebook.com/apps  → "Create App" → type "Business".
 *  2. Add the product "Facebook Login" → "Web".
 *  3. In Facebook Login → Settings, set Site URL to:  http://localhost:5500/
 *     and add  localhost  under "Allowed Domains for the JavaScript SDK".
 *  4. Copy your App ID from the app dashboard and paste it below.
 *  5. Serve this folder over http (NOT file://). Easiest options:
 *       - VS Code "Live Server" extension  → opens http://localhost:5500
 *       - or:  npx serve  (then use the printed http://localhost:PORT URL)
 *       - or:  python -m http.server 5500
 *  6. Open the http://localhost URL in the browser and connect Facebook.
 *
 * NOTE: While your app is in "Development" mode you can only read data for
 * Facebook accounts/pages that are added as Admins/Developers/Testers of the app.
 * Reading other people's pages needs Facebook App Review (production step).
 */
window.CARAPAL_CONFIG = {
  // 👇 PASTE YOUR FACEBOOK APP ID HERE
  FB_APP_ID: '',

  FB_API_VERSION: 'v21.0',

  // Permissions requested at login. pages_read_engagement lets us read
  // a page's posts & comments; pages_show_list lists the pages you manage.
  FB_SCOPES: 'public_profile,pages_show_list,pages_read_engagement',
};
