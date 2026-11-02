const DEFAULT_FROM = "Petty Cash Fund <onboarding@resend.dev>";

export async function sendSignInCode(to: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Missing RESEND_API_KEY");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to,
      subject: `Your Petty Cash sign-in code: ${code}`,
      text: `Your Petty Cash Fund sign-in code is ${code}.\n\nIt expires in 1 hour. If you didn't request it, you can ignore this email.`,
      html: `<p>Your Petty Cash Fund sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;font-family:monospace">${code}</p><p>It expires in 1 hour. If you didn't request it, you can ignore this email.</p>`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
  }
}
