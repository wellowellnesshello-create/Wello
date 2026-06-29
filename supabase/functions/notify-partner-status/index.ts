import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const DAY_IDX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 }

const CATEGORY_TAGS: Record<string, string[]> = {
  'Yoga':       ['Yoga', 'Wellness'],
  'Pilates':    ['Pilates', 'Fitness'],
  'Gym':        ['Gym', 'Fitness'],
  'Spa':        ['Spa', 'Wellness'],
  'Pool':       ['Pool', 'Swimming'],
  'Surf':       ['Surf', 'Outdoor'],
  'Meditation': ['Meditation', 'Wellness'],
  'Cycling':    ['Cycling', 'Fitness'],
  'Tennis':     ['Tennis', 'Sport'],
  'Golf':       ['Golf', 'Sport'],
  'Fitness':    ['Fitness', 'Training'],
  'Padel':      ['Padel', 'Sport'],
}

serve(async (req) => {
  const { record, old_record } = await req.json()
  const { name, email } = record
  const firstName = name.split(' ')[0]

  // ── status -> setting_up ──────────────────────────────────────
  if (record.status === 'setting_up' && old_record?.status !== 'setting_up') {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Reverting an approved venue: hide it from the marketplace by marking
    // the listing(s) inactive. Rows + slots are preserved so the partner can
    // come back into a clean state on re-approval (handled below).
    if (old_record?.status === 'approved') {
      const { error: deactivateErr } = await supabase
        .from('listings')
        .update({ status: 'inactive' })
        .eq('business_id', record.id)
      if (deactivateErr) console.error('Failed to deactivate listings:', deactivateErr.message)
    }

    // Multi-venue: when an already-logged-in partner adds a new venue from
    // the dashboard, the row already has user_id set. They don't need a
    // welcome email or a new auth user — they're already in the portal.
    if (record.user_id) {
      console.log('setting_up with user_id already set — skipping welcome email for', email)
      return new Response(JSON.stringify({ skipped: 'existing partner adding venue' }), { headers: { 'Content-Type': 'application/json' } })
    }

    const { error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { business_name: name }
    })
    if (createError && !createError.message.includes('already been registered')) {
      console.error('Auth user creation failed:', createError.message)
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: 'https://www.wello-wellness.com/?portal=business' }
    })
    if (linkError) console.error('Magic link generation failed:', linkError.message)
    const magicLink = linkData?.properties?.action_link ?? 'https://www.wello-wellness.com'

    const html = `<div style="font-family:Arial,sans-serif;max-width:480px;padding:32px;background:#FBF9F4;"><h1 style="color:#213C18;">wello</h1><div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #E4E2DD;"><h2 style="color:#213C18;">Time to set up your Wello listing</h2><p style="color:#74796E;line-height:1.7;">Hi ${firstName}, great news - we're ready to get ${name} set up on Wello.</p><p style="color:#74796E;line-height:1.7;">Complete your venue profile, add your sessions and classes, and set your credit price. Once you're happy with how everything looks, we'll review and get you live.</p><div style="text-align:center;margin:28px 0;"><a href="${magicLink}" style="display:inline-block;padding:13px 28px;background:#213C18;color:#fff;text-decoration:none;border-radius:2px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.3px;">Log in to your portal</a></div><p style="color:#A3A89E;font-size:11px;line-height:1.6;">This link logs you in automatically and expires after 24 hours. If it's expired, you can request a new one from the sign-in page.</p><p style="color:#74796E;line-height:1.7;">Any questions, reply here or email me directly.</p><p style="color:#1B1C19;font-weight:600;">James<br><span style="font-weight:400;color:#74796E;">Founder, Wello - <a href="mailto:hello@wello-wellness.com" style="color:#213C18;">hello@wello-wellness.com</a></span></p></div></div>`

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'James at Wello <hello@wello-wellness.com>', to: email, subject: 'Time to set up your Wello listing', html }),
    })

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  // ── status -> submitted ───────────────────────────────────────
  if (record.status === 'submitted' && old_record?.status !== 'submitted') {
    // If reverting from approved -> submitted (e.g. partner pulled changes
    // for re-review), pull the listing off the marketplace until we re-approve.
    if (old_record?.status === 'approved') {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
      const { error: deactivateErr } = await supabase
        .from('listings')
        .update({ status: 'inactive' })
        .eq('business_id', record.id)
      if (deactivateErr) console.error('Failed to deactivate listings:', deactivateErr.message)
    }

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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Prefer the partner's own selected tags; fall back to category defaults.
    const partnerTags = Array.isArray(record.tags) ? record.tags.filter(Boolean) : []
    const tags = partnerTags.length > 0
      ? partnerTags
      : (CATEGORY_TAGS[record.category] ?? (record.category ? [record.category] : []))

    // Look up an existing listing for this business so we don't insert a
    // duplicate when an admin re-approves a venue (approved -> setting_up -> approved).
    const { data: existing, error: existingErr } = await supabase
      .from('listings')
      .select('id')
      .eq('business_id', record.id)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (existingErr) console.error('Failed to check for existing listing:', existingErr.message)

    // Private instructors travel to their clients, so their listing's "loc"
    // should display their coverage area (address) rather than a fixed town.
    const isPrivate = record.category === 'Private Instructor'
    const displayLoc = isPrivate
      ? (record.address ?? record.location ?? null)
      : (record.location ?? record.address ?? null)

    let listingId: number | string | null = existing?.id ?? null
    const baseFields = {
      name: record.name,
      cat: record.category ?? null,
      loc: displayLoc,
      description: record.description ?? null,
      img: record.img ?? null,
      cr: record.cr ?? 3,
      tags,
      status: 'active',
    }

    if (listingId) {
      // Re-approval path: flip back to active and refresh the user-editable
      // fields. Slots are left alone — they were preserved from the first
      // approval and the partner can edit them via the dashboard.
      const { error: updErr } = await supabase
        .from('listings').update(baseFields).eq('id', listingId)
      if (updErr) console.error('Failed to update listing on re-approval:', updErr.message)
      else console.log('Listing re-activated for:', record.name, '| id:', listingId)
    } else {
      // First-time approval: insert listing + expand recurring slots.
      const { data: inserted, error: listingError } = await supabase
        .from('listings')
        .insert({
          business_id: record.id,
          ...baseFields,
          rating: 5.0,
          reviews: 0,
        })
        .select('id')
        .single()

      if (listingError) {
        console.error('Failed to create listing:', listingError.message)
      } else {
        listingId = inserted.id
        console.log('Listing created for:', record.name, '| id:', listingId)

        // ── Create slot instances from onboarding slot data ───────
        // businesses.slots is a JSONB array: [{id, name, days:["Mon","Tue"], time, dur, spots, cr}]
        // Expand each recurring slot into concrete date instances for the next 4 weeks.
        const today = new Date()
        const slotRows: object[] = []

        for (const sl of (record.slots ?? [])) {
          for (const day of (sl.days ?? [])) {
            const target = DAY_IDX[day] ?? 1
            const curr = today.getDay()
            const daysAhead = (target - curr + 7) % 7 || 7
            for (let week = 0; week < 4; week++) {
              const d = new Date(today)
              d.setDate(today.getDate() + daysAhead + week * 7)
              slotRows.push({
                listing_id: listingId,
                name: sl.name ?? '',
                date: d.toISOString().slice(0, 10),
                time: sl.time ?? '09:00',
                dur: sl.dur ?? '60 min',
                spots: sl.spots ?? 10,
                booked: 0,
                credits: sl.cr ?? record.cr ?? 3,
                acuity_type_id: sl.acuity_type_id ?? null,
              })
            }
          }
        }

        if (slotRows.length > 0) {
          const { error: slotsError } = await supabase.from('slots').insert(slotRows)
          if (slotsError) {
            console.error('Failed to create slots:', slotsError.message)
          } else {
            console.log('Created', slotRows.length, 'slot instances for listing', listingId)
          }
        }
      }
    }

    // ── Send approval email ───────────────────────────────────
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
