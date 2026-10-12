import { Card } from "@/components/ui/Card";
import {
  ASSIST_PHONE_DISPLAY, CONTACT_SAFETY_NOTE, smsLink, telLink, whatsappLink,
} from "@/lib/application-requests/contact";

const btn =
  "inline-flex h-10 items-center justify-center rounded border px-4 text-sm font-medium tap-target";

export function ContactAdminCard({ requestCode, examTitle }: { requestCode: string; examTitle: string }) {
  return (
    <Card className="p-4">
      <h2 className="text-base font-semibold text-ink">Need help faster? Contact us directly</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Message or call <span className="font-medium text-ink">{ASSIST_PHONE_DISPLAY}</span> and quote your request ID{" "}
        <span className="font-medium text-ink">{requestCode}</span>.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={whatsappLink(requestCode, examTitle)} target="_blank" rel="noopener noreferrer"
           className={`${btn} border-brand-600 bg-brand-600 text-white hover:bg-brand-700`}>
          Chat on WhatsApp
        </a>
        <a href={smsLink(requestCode)} className={`${btn} border-brand-600 text-brand-600 hover:bg-brand-50`}>Send SMS</a>
        <a href={telLink()} className={`${btn} border-hairline text-ink hover:bg-paper-sunk`}>Call</a>
      </div>
      <p className="mt-3 text-xs text-ink-faint">{CONTACT_SAFETY_NOTE}</p>
    </Card>
  );
}
