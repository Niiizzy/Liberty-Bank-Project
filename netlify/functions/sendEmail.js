exports.handler = async (event) => {
  try {
    if (event.httpMethod === "HEAD" || event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST,HEAD,OPTIONS" },
        body: ""
      };
    }
    const RESEND_KEY = process.env.RESEND_API_KEY || "re_2KPH3jbD_8L3mfzTBRQ6nwGoniJH9rU9o";
    if (!RESEND_KEY) {
      return { statusCode: 500, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ ok:false, error: "RESEND_API_KEY missing" }) };
    }
    const { to, subject, html } = JSON.parse(event.body || "{}");
    if (!to || !subject) {
      return { statusCode: 400, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ ok:false, error:"Missing 'to' or 'subject'" }) };
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Liberty Trust <onboarding@resend.dev>",
        to: [to],
        subject: subject,
        html: html
      })
    });
    const data = await res.json();
    return {
      statusCode: res.ok ? 200 : res.status,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: res.ok, status: res.status, resend: data })
    };
  } catch (e) {
    return { statusCode: 500, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ ok:false, error: e.message, stack: e.stack }) };
  }
};