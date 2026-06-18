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
