// Vercel Serverless Function: /api/feed
// Read-only. Returns social "threads" (a post + its comments) sourced from the
// tables that the n8n automation populates. The app no longer connects to social
// platforms directly — it only reads what n8n has stored in the database.
//
// Output shape:
//   { success: true,
//     threads: [ { id, platform, type, author, text, permalink, mediaUrl,
//                  createdTime, comments: [ { id, author, text, createdTime } ] } ],
//     counts: { facebook, instagram, twitter, google_play } }
const { getPool } = require('./db');

// Facebook author names from n8n can be noisy ("\n\n", "Hidden", a raw id, or null).
function cleanName(name, fallback) {
  if (!name) return fallback;
  const t = String(name).replace(/\s+/g, ' ').trim();
  if (!t || t.toLowerCase() === 'hidden') return fallback;
  return t;
}

async function buildFacebookThreads(pool) {
  // posts.id   = "{pageId}_{postId}"     -> post key is the part AFTER the underscore
  // comments.id = "{postId}_{commentId}" -> post key is the part BEFORE the underscore
  const [postsRes, commentsRes] = await Promise.all([
    pool.query(`SELECT id, message, created_time FROM facebook_posts`),
    pool.query(`SELECT id, message, created_time, from_name
                FROM facebook_comments
                WHERE message IS NOT NULL AND btrim(message) <> ''`)
  ]);

  // Group comments by the post id encoded in their own id.
  const commentsByPost = {};
  for (const c of commentsRes.rows) {
    const postKey = String(c.id).split('_')[0];
    (commentsByPost[postKey] = commentsByPost[postKey] || []).push({
      id: c.id,
      author: cleanName(c.from_name, 'Facebook User'),
      text: c.message,
      createdTime: c.created_time
    });
  }

  const threads = [];
  const usedKeys = new Set();
  for (const p of postsRes.rows) {
    const parts = String(p.id).split('_');
    const postKey = parts.length > 1 ? parts[1] : parts[0];
    const comments = commentsByPost[postKey] || [];
    usedKeys.add(postKey);
    threads.push({
      id: 'fb_' + p.id,
      platform: 'facebook',
      type: 'Post',
      author: 'Facebook Page',
      text: p.message || '(no text)',
      createdTime: p.created_time,
      comments: comments.sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime))
    });
  }

  // Comments whose post is not in facebook_posts -> surface them so nothing is lost.
  for (const [postKey, comments] of Object.entries(commentsByPost)) {
    if (usedKeys.has(postKey)) continue;
    threads.push({
      id: 'fb_orphan_' + postKey,
      platform: 'facebook',
      type: 'Comments',
      author: 'Facebook Page',
      text: '(original post not synced)',
      createdTime: comments[0] && comments[0].createdTime,
      comments: comments.sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime))
    });
  }

  return threads;
}

async function buildInstagramThreads(pool) {
  const [postsRes, commentsRes] = await Promise.all([
    pool.query(`SELECT id, media_type, media_url, permalink, timestamp, like_count
                FROM instagram_posts`),
    pool.query(`SELECT id, text, timestamp FROM instagram_comments
                WHERE text IS NOT NULL AND btrim(text) <> ''`)
  ]);

  const comments = commentsRes.rows
    .map(c => ({ id: c.id, author: 'Instagram User', text: c.text, createdTime: c.timestamp }))
    .sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));

  const posts = postsRes.rows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // NOTE: instagram_comments has no post/media id, so comments cannot be reliably
  // linked to a specific post. Best effort: attach all comments to the most recent
  // post. To fix properly, add a `media_id` column to instagram_comments in n8n.
  const threads = posts.map((p, idx) => ({
    id: 'ig_' + p.id,
    platform: 'instagram',
    type: 'Post',
    author: 'Instagram',
    text: p.permalink ? ('📷 Photo — ' + p.permalink) : '📷 Instagram photo',
    permalink: p.permalink,
    mediaUrl: p.media_url,
    createdTime: p.timestamp,
    comments: idx === 0 ? comments : []
  }));

  // If there are comments but no posts, still show the comments.
  if (posts.length === 0 && comments.length > 0) {
    threads.push({
      id: 'ig_comments',
      platform: 'instagram',
      type: 'Comments',
      author: 'Instagram',
      text: '(post not synced)',
      createdTime: comments[0].createdTime,
      comments
    });
  }

  return threads;
}

async function buildGooglePlayThreads(pool) {
  const res = await pool.query(
    `SELECT review_id, rating, author_name, comment, received_at, priority, next_action, department, user_type
     FROM google_play_reviews WHERE comment IS NOT NULL`);
  return res.rows.map(r => ({
    id: 'gp_' + r.review_id,
    platform: 'google_play',
    type: 'Review',
    author: cleanName(r.author_name, 'Play Store User'),
    text: (r.rating ? '★'.repeat(r.rating) + ' ' : '') + (r.comment || ''),
    createdTime: r.received_at,
    priority: r.priority || null,
    next_action: r.next_action || null,
    department: r.department || null,
    user_type: r.user_type || null,
    comments: []
  }));
}

async function buildTrustpilotThreads(pool) {
  const res = await pool.query(
    `SELECT review_id, rating, heading, author_name, comment, received_at, priority, next_action, department, user_type
     FROM trustpilot_reviews
     WHERE comment IS NOT NULL AND btrim(comment) <> ''
     ORDER BY received_at DESC NULLS LAST`);
  return res.rows.map(r => {
    const threadId = String(r.review_id).startsWith('tp_') ? r.review_id : 'tp_' + r.review_id;
    return {
      id: threadId,
      platform: 'trustpilot',
      type: (r.rating ? r.rating + '★ ' : '') + 'Review',
      author: cleanName(r.author_name, 'Trustpilot User'),
      text: (r.heading && r.heading !== 'N/A' ? r.heading + ' — ' : '') + (r.comment || ''),
      createdTime: r.received_at,
      priority: r.priority || null,
      next_action: r.next_action || null,
      department: r.department || null,
      user_type: r.user_type || null,
      comments: []
    };
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const pool = getPool();
  const threads = [];
  const counts = { facebook: 0, instagram: 0, twitter: 0, google_play: 0, trustpilot: 0 };

  // Each platform is isolated so a missing/empty table never breaks the whole feed.
  for (const [key, builder] of [
    ['facebook', buildFacebookThreads],
    ['instagram', buildInstagramThreads],
    ['google_play', buildGooglePlayThreads],
    ['trustpilot', buildTrustpilotThreads]
  ]) {
    try {
      const t = await builder(pool);
      counts[key] = t.length;
      threads.push(...t);
    } catch (err) {
      console.error('feed: ' + key + ' failed:', err.message);
    }
  }

  // Newest first across all platforms.
  threads.sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0));

  return res.status(200).json({ success: true, threads, counts });
};
