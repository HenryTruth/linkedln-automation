interface VerificationEmailOptions {
  email: string;
  verificationUrl: string;
}

function getEmailFrom(): string {
  return (
    process.env.EMAIL_FROM ??
    process.env.ALERT_EMAIL_FROM ??
    "Vectra <onboarding@resend.dev>"
  );
}

export function getDashboardPublicUrl(): string {
  return (
    process.env.DASHBOARD_PUBLIC_URL ??
    process.env.NEXT_PUBLIC_DASHBOARD_URL ??
    process.env.ALLOWED_ORIGINS?.split(",")[0]?.trim() ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function sendVerificationEmail({
  email,
  verificationUrl,
}: VerificationEmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info(`Email verification link for ${email}: ${verificationUrl}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getEmailFrom(),
      to: email,
      subject: "Verify your Vectra email",
      html: `
        <div style="font-family: Inter, Arial, sans-serif; color: #0f172a; line-height: 1.5;">
          <h1 style="font-size: 24px;">Verify your email</h1>
          <p>Welcome to Vectra. Confirm this email address to finish creating your account.</p>
          <p>
            <a href="${verificationUrl}" style="display: inline-block; background: #0f172a; color: white; padding: 12px 18px; border-radius: 10px; text-decoration: none; font-weight: 700;">
              Verify email
            </a>
          </p>
          <p style="font-size: 13px; color: #64748b;">This link expires in 24 hours.</p>
        </div>
      `,
      text: `Verify your Vectra email: ${verificationUrl}\n\nThis link expires in 24 hours.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend email failed: ${res.status} ${body}`);
  }
}
