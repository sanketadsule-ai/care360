import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db/prisma';

// ── GET: Webhook Verification ────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      return new NextResponse(challenge, { status: 200 });
    } else {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }
  
  return new NextResponse('Bad Request', { status: 400 });
}

// ── POST: Webhook Payload Ingestion ──────────────────
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256');

    // 1. Verify Signature (Security)
    if (process.env.FB_APP_SECRET && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.FB_APP_SECRET)
        .update(rawBody)
        .digest('hex');
      
      if (`sha256=${expectedSignature}` !== signature) {
        console.warn('Webhook signature mismatch!');
        return new NextResponse('Invalid signature', { status: 401 });
      }
    }

    const body = JSON.parse(rawBody);

    // 2. Process the Payload
    if (body.object === 'page' || body.object === 'instagram') {
      const entries = body.entry || [];
      
      for (const entry of entries) {
        // Find the channel in our DB
        const channelId = entry.id;
        const channel = await prisma.channels.findFirst({
          where: { platform_id: channelId }
        });

        if (!channel) {
          console.warn(`Webhook received for unknown channel: ${channelId}`);
          continue;
        }

        const changes = entry.changes || [];
        for (const change of changes) {
          // Handle feed/comments
          if (change.field === 'feed' || change.field === 'comments') {
            const val = change.value;
            
            // Skip if it's not a valid message/comment
            if (!val.message && !val.text) continue;

            const platformMessageId = val.comment_id || val.post_id || val.id;
            const authorName = val.from ? val.from.name : 'Unknown User';
            const content = val.message || val.text;
            const createdTime = val.created_time ? new Date(val.created_time * 1000) : new Date();

            // Idempotent Insert into Database
            await prisma.messages.upsert({
              where: { platform_message_id: platformMessageId },
              update: {
                content: content,
                updated_at: new Date()
              },
              create: {
                channel_id: channel.id,
                platform_message_id: platformMessageId,
                type: val.item === 'comment' ? 'Comment' : 'Post',
                author_name: authorName,
                content: content,
                sentiment: 'unset',
                status: 'open',
                platform_created_at: createdTime
              }
            });
          }
        }
        
        // Handle direct messages (messaging)
        const messages = entry.messaging || [];
        for (const msg of messages) {
          if (msg.message && !msg.message.is_echo) {
            const platformMessageId = msg.message.mid;
            const senderId = msg.sender.id;
            const content = msg.message.text;
            const createdTime = new Date(msg.timestamp);

            await prisma.messages.upsert({
              where: { platform_message_id: platformMessageId },
              update: { content: content, updated_at: new Date() },
              create: {
                channel_id: channel.id,
                platform_message_id: platformMessageId,
                type: 'Direct Message',
                author_name: `User ${senderId}`,
                content: content,
                sentiment: 'unset',
                status: 'open',
                platform_created_at: createdTime
              }
            });
          }
        }
      }

      return new NextResponse('EVENT_RECEIVED', { status: 200 });
    } else {
      return new NextResponse('Not a page/instagram event', { status: 404 });
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
