// Cron endpoint for scheduled daily email sending
// This endpoint should be called daily at 10 AM

import { NextResponse } from 'next/server';
import { generateMarketOverviewEmail } from '@/lib/email/generate-email';
import { sendMarketOverviewEmail } from '@/lib/email/send-email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Recipients for the daily email come from the required DIGEST_RECIPIENTS env
// var (comma-separated email addresses). Returns null when unset/empty.
function digestRecipients(): { email: string }[] | null {
  const raw = process.env.DIGEST_RECIPIENTS;
  if (!raw) return null;
  const emails = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (emails.length === 0) return null;
  return emails.map(email => ({ email }));
}

export async function GET(request: Request) {
  // Verify the request is from a valid cron source (Vercel Cron or authorized source)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // If CRON_SECRET is set, verify it
  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('Unauthorized cron request');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  const recipients = digestRecipients();
  if (!recipients) {
    console.error('DIGEST_RECIPIENTS is not set');
    return NextResponse.json(
      {
        success: false,
        error:
          'DIGEST_RECIPIENTS is not configured. Set it to a comma-separated list of recipient email addresses.',
      },
      { status: 500 }
    );
  }

  try {
    console.log(`[${new Date().toISOString()}] Starting scheduled email generation...`);

    const { html, error: generateError } = await generateMarketOverviewEmail();

    if (generateError || !html) {
      console.error('Failed to generate email:', generateError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to generate email',
          details: generateError || 'No HTML content generated',
        },
        { status: 500 }
      );
    }

    console.log('Sending email to recipients:', recipients.map(r => r.email).join(', '));
    const sendResult = await sendMarketOverviewEmail(html, recipients);

    if (!sendResult.success) {
      console.error('Failed to send email:', sendResult.error);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to send email',
          details: sendResult.error,
        },
        { status: 500 }
      );
    }

    console.log(`[${new Date().toISOString()}] Email sent successfully. Message ID: ${sendResult.messageId}`);

    return NextResponse.json({
      success: true,
      messageId: sendResult.messageId,
      recipients: recipients.map(r => r.email),
      timestamp: new Date().toISOString(),
      message: 'Daily email sent successfully',
    });
  } catch (error) {
    console.error('Error in cron endpoint:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Also support POST for compatibility
export async function POST(request: Request) {
  return GET(request);
}

