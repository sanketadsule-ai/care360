import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

export async function GET() {
  try {
    // Attempt to query the database to verify the connection
    await prisma.$queryRaw`SELECT 1`;
    
    return NextResponse.json({ 
      status: 'success', 
      message: 'Successfully connected to Aiven PostgreSQL database' 
    });
  } catch (error) {
    console.error('Database connection error:', error);
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to connect to the database',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
