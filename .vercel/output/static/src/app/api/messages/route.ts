import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channel_id');

    let whereClause = {};
    if (channelId) {
      whereClause = { channel_id: channelId };
    }

    const messages = await prisma.messages.findMany({
      where: whereClause,
      orderBy: { platform_created_at: 'desc' },
      take: 50,
      include: {
        channel: {
          select: { name: true, platform: true }
        }
      }
    });

    return NextResponse.json({ success: true, data: messages });
  } catch (error: any) {
    console.error('Failed to fetch messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    const savedMessages = [];

    for (const msg of messages) {
      const saved = await prisma.messages.upsert({
        where: { platform_message_id: msg.platform_message_id },
        update: {
          content: msg.content,
          author_name: msg.author_name,
        },
        create: {
          channel_id: msg.channel_id,
          platform_message_id: msg.platform_message_id,
          type: msg.type || 'Email',
          author_name: msg.author_name,
          content: msg.content,
          platform_created_at: new Date(msg.platform_created_at),
          status: 'open'
        }
      });
      savedMessages.push(saved);
    }

    return NextResponse.json({ success: true, count: savedMessages.length }, { status: 200 });

  } catch (error: any) {
    console.error('Failed to save messages:', error);
    return NextResponse.json({ error: 'Failed to save messages', details: error.message }, { status: 500 });
  }
}
