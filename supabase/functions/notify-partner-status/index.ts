import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  const { record, old_record } = await req.json()
  const { name, email } = record
  const firstName = name.split(' ')[0]

  // ── status -> setting_up ──────────────────────────────────────
  if (record.status === 'setting_up' && old_record?.status !== 'setting_up') {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Create the Auth user with service role key
    const { error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { business_name: name }
    })
    if (createError && !createError.message.includes('already been registered')) {
      console.error('Auth user creation failed:', createError.message)
    }

    // Generate a magic link so they can log in immediately from the email
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: 'https://www.wello-wellness.com/?portal=business' }
    })
    if (linkError) console.error('Magic link generation failed:', linkError.message)
    const magicLink = linkData?.properties?.action_link ?? 'https://www.wello-wellness.com'

    const html = `<div style="font-family:Arial,sans-serif;max-width:480px;padding:32px;background:#FBF9F4;"><h1 style="color:#213C18;">wello</h1><div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #E4E2DD;"><h2 style="color:#213C18;">Time to set up your Wello listing</h2><p style="color:#74796E;line-height:1.7;">Hi ${firstName}, great news - we're ready to get ${name} set up on Wello.</p><p style="color:#74796E;line-height:1.7;">Complete your venue profile, add your classes or courts, and set your credit price. Once you're happy with how everything looks, we'll review and get you live.</p><div style="text-align:center;margin:28px 0;"><a href="${magicLink}" style="display:inline-block;padding:13px 28px;background:#213C18;color:#fff;text-decoration:none;border-radius:2px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.3px;">Log in to your portal</a></div><p style="color:#A3A89E;font-size:11px;line-height:1.6;">This link logs you in automatically and expires after 24 hours. If it's expired, you can request a new one from the sign-in page.</p><p style="color:#74796E;line-height:1.7;">Any questions, reply here or email me directly.</p><p style="color:#1B1C19;font-weight:600;">James<br><span style="font-weight:400;color:#74796E;">Founder, Wello - <a href="mailto:hello@wello-wellness.com" style="color:#213C18;">hello@wello-wellness.com</a></span></p></div></div>`

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'James at Wello <hello@wello-wellness.com>', to: email, subject: 'Time to set up your Wello listing', html }),
    })

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  // ── status -> submitted ───────────────────────────────────────
  if (record.status === 'submitted' && old_record?.status !== 'submitted') {
    const partnerHtml = `<div style="font-family:Arial,sans-serif;max-width:480px;padding:32px;background:#FBF9F4;"><h1 style="color:#213C18;">wello</h1><div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #E4E2DD;"><h2 style="color:#213C18;">We've got your listing, ${firstName}.</h2><p style="color:#74796E;line-height:1.7;">Thanks for submitting ${name} - we'll review your listing and be in touch within 2 working days.</p><p style="color:#74796E;line-height:1.7;">We'll let you know if we have any questions or tweaks before getting you live on the marketplace.</p><p style="color:#1B1C19;font-weight:600;">James<br><span style="font-weight:400;color:#74796E;">Founder, Wello - <a href="mailto:hello@wello-wellness.com" style="color:#213C18;">hello@wello-wellness.com</a></span></p></div></div>`

    const adminHtml = `<div style="font-family:Arial,sans-serif;padding:32px;background:#FBF9F4;"><h2 style="color:#213C18;">New listing submitted for review</h2><p><b>Venue:</b> ${name}</p><p><b>Email:</b> ${email}</p><p style="color:#74796E;">Log in to the Supabase dashboard to review and approve this listing.</p></div>`

    await Promise.all([
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'James at Wello <hello@wello-wellness.com>', to: email, subject: `We've received your Wello listing`, html: partnerHtml }),
      }),
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Wello <hello@wello-wellness.com>', to: 'hello@wello-wellness.com', subject: `Review needed: ${name} has submitted their listing`, html: adminHtml }),
      }),
    ])

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  // ── status -> approved ────────────────────────────────────────
  if (record.status === 'approved' && old_record?.status !== 'approved') {
    const approvedHtml = `<div style="font-family:Arial,sans-serif;max-width:480px;padding:32px;background:#FBF9F4;"><h1 style="color:#213C18;">wello</h1><div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #E4E2DD;"><h2 style="color:#213C18;">You're live on Wello!</h2><p style="color:#74796E;line-height:1.7;">Hi ${firstName}, great news - your listing is now live on Wello.</p><p style="color:#74796E;line-height:1.7;">Members can find and book your venue at <a href="https://wello-wellness.com" style="color:#213C18;font-weight:600;">wello-wellness.com</a>.</p><p style="color:#74796E;line-height:1.7;">If you need to make any changes to your listing, log in to your dashboard at <a href="https://www.wello-wellness.com/?portal=business" style="color:#213C18;font-weight:600;">wello-wellness.com</a> and click Business.</p><p style="color:#74796E;line-height:1.7;">Welcome to Wello.</p><p style="color:#1B1C19;font-weight:600;">James<br><span style="font-weight:400;color:#74796E;">Founder, Wello - <a href="mailto:hello@wello-wellness.com" style="color:#213C18;">hello@wello-wellness.com</a></span></p></div></div>`

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'James at Wello <hello@wello-wellness.com>', to: email, subject: "You're live on Wello!", html: approvedHtml }),
    })

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ skipped: true }), { headers: { 'Content-Type': 'application/json' } })
})
