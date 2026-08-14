import Script from "next/script";
import invitationDocument from "../index.html?raw";

function extractInvitationMarkup(documentSource: string) {
  const body = documentSource.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";

  return body.replace(
    /<script\s+type="module"\s+src="assets\/scripts\/app\.js"><\/script>/i,
    ""
  );
}

const invitationMarkup = extractInvitationMarkup(invitationDocument);

export default function Home() {
  return (
    <>
      <div
        className="wedding-document"
        dangerouslySetInnerHTML={{ __html: invitationMarkup }}
      />
      <Script
        id="wedding-experience"
        src="/assets/scripts/app.js"
        type="module"
        strategy="afterInteractive"
      />
    </>
  );
}
