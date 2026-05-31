import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const WELLO_EMAIL = 'hello@wello-wellness.com'

serve(async (req) => {
  const { record } = await req.json()
  const { name, email, phone, category, location, notes } = record

  const notifyHtml = `<div style="font-family:Arial,sans-serif;padding:32px;background:#FBF9F4;"><h2 style="color:#213C18;">New partner registration</h2><p><b>Venue:</b> ${name}</p><p><b>Email:</b> ${email}</p><p><b>Phone:</b> ${phone}</p><p><b>Category:</b> ${category || 'Not specified'}</p><p><b>Location:</b> ${location || 'Not specified'}</p>${notes ? `<p><b>Notes:</b> ${notes}</p>` : ''}</div>`

  const firstName = name.split(' ')[0]
  const confirmHtml = `<div style="font-family:Arial,sans-serif;max-width:480px;padding:32px;background:#FBF9F4;"><h1 style="color:#213C18;">wello</h1><div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #E4E2DD;"><h2 style="color:#213C18;">Thank you, ${firstName}.</h2><p style="color:#74796E;line-height:1.7;">We really appreciate your interest in partnering with Wello. It means a lot to have you as part of what we are building on the island.</p><p style="color:#74796E;line-height:1.7;">I'll be in touch shortly to get everything set up.</p><p style="color:#74796E;line-height:1.7;">In the meantime, feel free to take a look: <a href="https://wello-wellness.com" style="color:#213C18;font-weight:600;">wello-wellness.com</a></p><p style="color:#1B1C19;font-weight:600;">James<br><span style="font-weight:400;color:#74796E;">Founder, Wello</span></p></div></div>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Wello <hello@wello-wellness.com>', to: WELLO_EMAIL, subject: `New partner registration - ${name}`, html: notifyHtml }),
  })

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'James at Wello <hello@wello-wellness.com>', to: email, subject: 'Thanks for your interest in Wello', html: confirmHtml }),
  })

  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
})
