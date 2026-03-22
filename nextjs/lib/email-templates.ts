interface ConfirmationEmailProps {
  confirmationUrl: string;
  type: string;
}

export function getConfirmationEmailHtml({
  confirmationUrl,
  type,
}: ConfirmationEmailProps): string {
  const typeMessages: Record<string, string> = {
    updates: "project updates and new features",
    mochi_request: "mochi availability notifications",
    collection_request: "new collection request updates",
  };

  const message = typeMessages[type] || "updates";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm your subscription</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #f472b6 0%, #a855f7 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: bold;">
                Mochi
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px 0; color: #1f2937; font-size: 20px; font-weight: 600;">
                Confirm your subscription
              </h2>
              <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Thanks for signing up to receive ${message} from Mochi!
              </p>
              <p style="margin: 0 0 32px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Please click the button below to confirm your email address:
              </p>

              <!-- Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${confirmationUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f472b6 0%, #a855f7 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 12px;">
                      Confirm Email
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 32px 0 0 0; color: #9ca3af; font-size: 14px; line-height: 1.6;">
                If you didn't sign up for this, you can safely ignore this email.
              </p>

              <p style="margin: 24px 0 0 0; color: #9ca3af; font-size: 12px; line-height: 1.6;">
                Button not working? Copy and paste this link into your browser:<br>
                <a href="${confirmationUrl}" style="color: #a855f7; word-break: break-all;">${confirmationUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Mochi - Browser pets for everyone
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

export function getConfirmationEmailText({
  confirmationUrl,
  type,
}: ConfirmationEmailProps): string {
  const typeMessages: Record<string, string> = {
    updates: "project updates and new features",
    mochi_request: "mochi availability notifications",
    collection_request: "new collection request updates",
  };

  const message = typeMessages[type] || "updates";

  return `
Confirm your subscription to Mochi

Thanks for signing up to receive ${message}!

Please confirm your email address by visiting this link:
${confirmationUrl}

If you didn't sign up for this, you can safely ignore this email.

---
Mochi - Browser pets for everyone
`.trim();
}
