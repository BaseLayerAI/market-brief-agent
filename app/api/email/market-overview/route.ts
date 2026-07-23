// API endpoint to generate daily market overview email (preview only, returns HTML)

import { NextResponse } from 'next/server';
import { generateMarketOverviewEmail } from '@/lib/email/generate-email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const { html, error } = await generateMarketOverviewEmail();

  if (error || !html) {
    return NextResponse.json(
      { error: 'Failed to generate market overview email', details: error || 'No HTML content generated' },
      { status: 500 }
    );
  }

  // Return HTML email
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

