const VALID_SITES = new Set(Array.from({ length: 10 }, (_, index) => String(index + 1)));

export async function POST(request: Request) {
  const body = await request.json() as Record<string, string>;
  if (!VALID_SITES.has(body.site) || !body.checkIn || !body.checkOut) {
    return Response.json({ error: "The booking details are incomplete." }, { status: 400 });
  }

  const key = process.env.STRIPE_RESTRICTED_KEY;
  if (!key) {
    return Response.json(
      { error: "Online deposits are not active yet. The booking experience is ready; Stripe still needs the retreat’s restricted key." },
      { status: 503 },
    );
  }

  const origin = new URL(request.url).origin;
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${origin}/success?session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${origin}/checkout?site=${encodeURIComponent(body.site)}&name=${encodeURIComponent(body.name)}`);
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][unit_amount]", "5000");
  form.set("line_items[0][price_data][product_data][name]", `H Mountain campsite ${body.site} deposit`);
  form.set("line_items[0][price_data][product_data][description]", `${body.name}: ${body.checkIn} to ${body.checkOut}`);
  form.set("line_items[0][quantity]", "1");
  form.set("metadata[campsite]", body.site);
  form.set("metadata[check_in]", body.checkIn);
  form.set("metadata[check_out]", body.checkOut);
  form.set("integration_identifier", "hmountain_qtvrplmx");

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const data = await response.json() as { url?: string; error?: { message?: string } };
  if (!response.ok || !data.url) {
    return Response.json({ error: data.error?.message || "Stripe could not start checkout." }, { status: 502 });
  }
  return Response.json({ url: data.url });
}
