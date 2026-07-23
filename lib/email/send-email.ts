// Email sending utility using Resend

import { Resend } from 'resend';

// Lazy init: constructing Resend without a key throws, which breaks
// `next build` page-data collection when env vars aren't set locally
let resendClient: Resend | null = null;
function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export interface EmailRecipient {
  email: string;
  name?: string;
}

/**
 * Sends the market overview email to specified recipients
 */
export async function sendMarketOverviewEmail(
  htmlContent: string,
  recipients: EmailRecipient[]
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not found in environment variables');
    return {
      success: false,
      error: 'RESEND_API_KEY not configured',
    };
  }

  // EMAIL_FROM must be an address on a domain verified in Resend. The fallback
  // (onboarding@resend.dev) is Resend's shared testing sender — fine for
  // trying things out, but set EMAIL_FROM for real deliveries.
  const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const fromName = process.env.EMAIL_FROM_NAME || 'Market Brief';

  try {
    const result = await getResend().emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: recipients.map(r => r.email),
      subject: `Daily Market Overview - ${new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })}`,
      html: htmlContent,
    });

    if (result.error) {
      console.error('Resend API error:', result.error);
      return {
        success: false,
        error: result.error.message || 'Unknown error from Resend',
      };
    }

    console.log('Email sent successfully:', result.data?.id);
    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

