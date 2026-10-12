// GovAssist assistance contact shown to applicants after they submit a
// request. Public business number (provided by the project owner).
export const ASSIST_PHONE_E164 = "917017453851"; // country code + number, no "+"
export const ASSIST_PHONE_DISPLAY = "+91 70174 53851";

export function whatsappLink(requestCode: string, examTitle: string): string {
  const text = `Hello GovAssist, my application request ${requestCode} for ${examTitle} needs assistance.`;
  return `https://wa.me/${ASSIST_PHONE_E164}?text=${encodeURIComponent(text)}`;
}

export function smsLink(requestCode: string): string {
  return `sms:+${ASSIST_PHONE_E164}?body=${encodeURIComponent(`Hello GovAssist, request ${requestCode}`)}`;
}

export function telLink(): string {
  return `tel:+${ASSIST_PHONE_E164}`;
}

export const CONTACT_SAFETY_NOTE =
  "Never send passwords, OTPs or payment details on WhatsApp, SMS or email — GovAssist will never ask for them.";
