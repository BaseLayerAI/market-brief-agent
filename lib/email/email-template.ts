// HTML email template generator for market overview

import { PrestockToken } from './prestock-data';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Formats percentage change with color coding
 */
function formatPriceChange(change?: number): { text: string; color: string } {
  if (change === undefined || change === null || isNaN(change)) {
    return { text: 'N/A', color: '#666666' };
  }
  
  const sign = change >= 0 ? '+' : '';
  const color = change >= 0 ? '#00C853' : '#FF1744';
  return {
    text: `${sign}${change.toFixed(2)}%`,
    color,
  };
}

/**
 * Formats volume in human-readable format
 */
function formatVolume(volume: number): string {
  if (volume >= 1e9) {
    return `$${(volume / 1e9).toFixed(2)}B`;
  } else if (volume >= 1e6) {
    return `$${(volume / 1e6).toFixed(2)}M`;
  } else if (volume >= 1e3) {
    return `$${(volume / 1e3).toFixed(2)}K`;
  }
  return `$${volume.toFixed(2)}`;
}

/**
 * Converts image file to base64 data URL
 */
function fileToDataUrl(fullPath: string): string {
  try {
    const imageBuffer = fs.readFileSync(fullPath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(fullPath).slice(1).toLowerCase();
    let mimeType = `image/${ext}`;
    if (ext === 'webp') {
      mimeType = 'image/webp';
    } else if (ext === 'svg') {
      mimeType = 'image/svg+xml';
    } else if (ext === 'jpg' || ext === 'jpeg') {
      mimeType = 'image/jpeg';
    }
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error(`Error converting image to base64: ${fullPath}`, error);
    return '';
  }
}

/**
 * Converts an image under public/ to a base64 data URL
 */
function imageToBase64(imagePath: string): string {
  // Remove leading slash if present and join with public directory
  const cleanPath = imagePath.startsWith('/') ? imagePath.slice(1) : imagePath;
  return fileToDataUrl(path.join(process.cwd(), 'public', cleanPath));
}

/**
 * Gets the brand logo for the email header, if one is configured.
 *
 * Reads the optional LOGO_PATH env var — either a path relative to public/
 * (e.g. "logo.png") or an absolute filesystem path. Returns a base64 data URL,
 * or null when unset or unreadable, in which case the template renders a
 * clean text-only header.
 */
function getBrandLogo(): string | null {
  const logoPath = process.env.LOGO_PATH;
  if (!logoPath) {
    return null;
  }
  const logo = path.isAbsolute(logoPath)
    ? fileToDataUrl(logoPath)
    : imageToBase64(logoPath);
  return logo || null;
}

interface FooterLink {
  label: string;
  url: string;
}

/**
 * Reads optional footer links from the FOOTER_LINKS env var — a JSON array of
 * { label, url } objects. Defaults to no links.
 */
function getFooterLinks(): FooterLink[] {
  const raw = process.env.FOOTER_LINKS;
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error('FOOTER_LINKS must be a JSON array of { label, url } objects');
      return [];
    }
    return parsed.filter(
      (link): link is FooterLink =>
        !!link && typeof link.label === 'string' && typeof link.url === 'string'
    );
  } catch (error) {
    console.error('Invalid FOOTER_LINKS JSON:', error);
    return [];
  }
}

/**
 * Generates HTML email template
 */
export function generateEmailTemplate(
  tradingViewScreenshotBase64: string,
  prestockTokens: PrestockToken[],
  date: Date = new Date(),
  marketInsights: Array<{ title: string; description: string; link: string }> = []
): string {
  const dateString = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Sort prestock tokens by 24hr growth (highest to lowest)
  const sortedPrestockTokens = [...prestockTokens].sort((a, b) => {
    const aChange = a.priceChange24h ?? -Infinity;
    const bChange = b.priceChange24h ?? -Infinity;
    return bChange - aChange; // Descending order (highest first)
  });

  // Generate Prestock rows
  const prestockRows = sortedPrestockTokens
    .map((token) => {
      const logoBase64 = imageToBase64(token.logoPath);
      const priceChange = formatPriceChange(token.priceChange24h);
      const volumeFormatted = formatVolume(token.volumeUSD);
      const marketCap = token.marketCapFormatted || 'N/A';

      return `
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 10px; vertical-align: middle;">
            ${logoBase64 ? `<img src="${logoBase64}" alt="${token.name}" style="width: 36px; height: 36px; border-radius: 6px; object-fit: contain;" />` : ''}
          </td>
          <td style="padding: 10px; vertical-align: middle; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; color: #1a1a1a;">
            ${token.name}
          </td>
          <td style="padding: 10px; vertical-align: middle; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; color: ${priceChange.color};">
            ${priceChange.text}
          </td>
          <td style="padding: 10px; vertical-align: middle; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #1a1a1a;">
            ${marketCap}
          </td>
          <td style="padding: 10px; vertical-align: middle; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #1a1a1a;">
            ${volumeFormatted}
          </td>
        </tr>
      `;
    })
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Market Overview - ${dateString}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
    <tr>
      <td style="padding: 0;">
        <!-- Main Container -->
        <table role="presentation" style="width: 100%; max-width: 800px; margin: 0 auto; background-color: #ffffff; border-collapse: collapse;">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 30px 30px; background-color: #ffffff; border-bottom: 2px solid #e0e0e0;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="vertical-align: top;">
                    ${(() => {
                      const brandLogo = getBrandLogo();
                      return brandLogo ? `<img src="${brandLogo}" alt="Logo" style="max-width: 200px; height: auto; margin-bottom: 20px; display: block;" />` : '';
                    })()}
                    <h1 style="margin: 0 0 10px 0; font-size: 32px; font-weight: 700; color: #1a1a1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; text-align: left;">
                      Daily Market Overview
                    </h1>
                    <p style="margin: 0; font-size: 16px; color: #666666; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; text-align: left;">
                      ${dateString}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- TradingView Heatmap Section -->
          <tr>
            <td style="padding: 40px 30px; background-color: #ffffff;">
              <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 600; color: #1a1a1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                Market Heatmap
              </h2>
              <div style="text-align: center;">
                <img src="data:image/png;base64,${tradingViewScreenshotBase64}" alt="Stock Market Heatmap" style="width: 100%; max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
              </div>
            </td>
          </tr>
          
          <!-- Prestock Gains Section -->
          <tr>
            <td style="padding: 30px 30px; background-color: #ffffff;">
              <h2 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 600; color: #1a1a1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                Top Prestock Performers
              </h2>
              <!-- Prestock Table -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #ffffff;">
                <!-- Table Header -->
                <tr style="background-color: #f8f9fa; border-bottom: 1px solid #e0e0e0;">
                  <th style="padding: 8px 10px; text-align: left; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 600; color: #666666; text-transform: uppercase; letter-spacing: 0.3px;">
                    Logo
                  </th>
                  <th style="padding: 8px 10px; text-align: left; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 600; color: #666666; text-transform: uppercase; letter-spacing: 0.3px;">
                    Company
                  </th>
                  <th style="padding: 8px 10px; text-align: left; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 600; color: #666666; text-transform: uppercase; letter-spacing: 0.3px;">
                    24hr Change
                  </th>
                  <th style="padding: 8px 10px; text-align: left; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 600; color: #666666; text-transform: uppercase; letter-spacing: 0.3px;">
                    Market Cap
                  </th>
                  <th style="padding: 8px 10px; text-align: left; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 600; color: #666666; text-transform: uppercase; letter-spacing: 0.3px;">
                    Volume (24h)
                  </th>
                </tr>
                ${prestockRows}
              </table>
            </td>
          </tr>
          
          <!-- Market Overview Section -->
          ${marketInsights.length > 0 ? `
          <tr>
            <td style="padding: 40px 30px; background-color: #ffffff;">
              <h2 style="margin: 0 0 30px 0; font-size: 24px; font-weight: 600; color: #1a1a1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                Market Overview
              </h2>
              
              ${marketInsights.map((insight, index) => `
                <div style="margin-bottom: ${index < marketInsights.length - 1 ? '30px' : '0'}; padding-bottom: ${index < marketInsights.length - 1 ? '30px' : '0'}; border-bottom: ${index < marketInsights.length - 1 ? '1px solid #e0e0e0' : 'none'};">
                  <h3 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 600; color: #1a1a1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                    ${insight.title}
                  </h3>
                  <p style="margin: 0 0 10px 0; font-size: 16px; line-height: 1.6; color: #333333; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                    ${insight.description}
                  </p>
                  <a href="${insight.link}" style="display: inline-block; font-size: 14px; color: #0066cc; text-decoration: underline; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;" target="_blank" rel="noopener noreferrer">
                    Read more →
                  </a>
                </div>
              `).join('')}
            </td>
          </tr>
          ` : ''}
          
          <!-- Footer -->
          <tr>
            <td style="padding: 15px 30px; background-color: #f8f9fa; border-top: 1px solid #e0e0e0;">
              ${(() => {
                const footerLinks = getFooterLinks();
                if (footerLinks.length === 0) return '';
                return `
              <!-- Footer Links -->
              <div style="text-align: center; margin-bottom: 6px;">
                ${footerLinks
                  .map(
                    link => `<a href="${link.url}" style="display: inline-block; margin: 0 8px; font-size: 12px; color: #666666; text-decoration: none; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;" target="_blank" rel="noopener noreferrer">${link.label}</a>`
                  )
                  .join('<span style="color: #cccccc; margin: 0 4px;">|</span>')}
              </div>`;
              })()}

              <!-- Attribution -->
              <div style="text-align: center; margin-bottom: 6px;">
                <p style="margin: 0; font-size: 11px; color: #999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.4;">
                  Data provided by <a href="https://jup.ag" style="color: #999999; text-decoration: underline;" target="_blank" rel="noopener noreferrer">Jupiter API</a>${marketInsights.length > 0 ? ' and <a href="https://www.perplexity.ai" style="color: #999999; text-decoration: underline;" target="_blank" rel="noopener noreferrer">Perplexity AI</a>' : ''}
                </p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return html;
}

