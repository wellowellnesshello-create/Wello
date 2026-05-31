import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

serve(async (req) => {
  const { record, old_record } = await req.json()

  if (record.status !== 'setting_up' || old_record?.status === 'setting_up') {
    return new Response(JSON.stringify({ skipped: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  const { name, email } = record
  const firstName = name.split(' ')[0]

  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;padding:32px;background:#FBF9F4;"><h1 style="color:#213C18;">wello</h1><div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #E4E2DD;"><h2 style="color:#213C18;">Time to set up your Wello listing</h2><p style="color:#74796E;line-height:1.7;">Hi ${firstName}, great news — we're ready to get ${name} set up on Wello.</p><p style="color:#74796E;line-height:1.7;">Log in to your business portal at <a href="https://wello-wellness.com" style="color:#213C18;font-weight:600;">wello-wellness.com</a> and complete your venue profile, add your classes or courts, and set your credit price.</p><p style="color:#74796E;line-height:1.7;">Once you're happy with how everything looks, we'll review and get you live.</p><p style="color:#74796E;line-height:1.7;">Any questions, reply here or call me directly.</p><p style="color:#1B1C19;font-weight:600;">James<br><span style="font-weight:400;color:#74796E;">Founder, Wello</span></p></div></div>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'James at Wello <hello@wello-wellness.com>', to: email, subject: 'Time to set up your Wello listing', html }),
  })

  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
})
