import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { encryptToken } from '@/lib/encryption';

export async function POST(request: Request) {
  try {
    const { pages } = await request.json();

    if (!Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json({ error: 'No pages provided' }, { status: 400 });
    }

    // Since we don't have authentication yet, we'll assign these channels
    // to a default admin user. We'll create one if it doesn't exist.
    const defaultUserEmail = 'admin@carapal360.com';
    let user = await prisma.users.findUnique({
      where: { email: defaultUserEmail }
    });

    if (!user) {
      user = await prisma.users.create({
        data: {
          email: defaultUserEmail,
          name: 'Carapal Admin',
          role: 'admin',
        }
      });
    }

    const savedChannels = [];

    // Upsert all pages into the channels table
    for (const page of pages) {
      // Security: Encrypt the access token before storing!
      const encryptedToken = encryptToken(page.accessToken);

      const channel = await prisma.channels.upsert({
        where: { id: page.id }, // Use Facebook's page ID as the channel ID
        update: {
          name: page.name,
          handle: page.name.replace(/\s+/g, ''),
          avatar_url: page.pictureUrl,
          access_token: encryptedToken,
          is_admin: page.isAdmin,
          status: 'active',
          platform: page.platform || 'facebook',
        },
        create: {
          id: page.id,
          user_id: user.id,
          platform: page.platform || 'facebook',
          platform_id: page.id,
          name: page.name,
          handle: page.name.replace(/\s+/g, ''),
          avatar_url: page.pictureUrl,
          access_token: encryptedToken,
          is_admin: page.isAdmin,
          status: 'active',
        }
      });

      savedChannels.push(channel);
    }

    return NextResponse.json({ 
      success: true, 
      count: savedChannels.length 
    }, { status: 200 });

  } catch (error: any) {
    console.error('Failed to save channels:', error);
    return NextResponse.json({ 
      error: 'Failed to save channels', 
      details: error.message 
    }, { status: 500 });
  }
}
