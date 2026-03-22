import { Resend } from "resend";

let resendInstance: Resend | null = null;

export function getResend(): Resend | null {
  if (resendInstance) {
    return resendInstance;
  }

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  resendInstance = new Resend(apiKey);
  return resendInstance;
}
