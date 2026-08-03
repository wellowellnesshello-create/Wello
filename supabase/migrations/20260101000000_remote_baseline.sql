


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."bookings_safety_window_check"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_safety boolean;
  v_session_start timestamptz;
begin
  -- Only enforce on new confirmed bookings. pending_instructor bookings
  -- follow their own 48h flow and are exempt.
  if new.status is distinct from 'confirmed' then
    return new;
  end if;

  select b.cancellation_safety_window
    into v_safety
    from businesses b
   where b.id = new.business_id;

  if v_safety is not true then
    return new;
  end if;

  v_session_start := ((new.booking_date::text || ' ' || new.start_time::text)::timestamp)
                     at time zone 'Europe/Madrid';

  if v_session_start < (now() + interval '2 hours') then
    raise exception
      'This session is too close to start time to book. Please pick a slot at least 2 hours from now.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."bookings_safety_window_check"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_slot_on_booking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if new.slot_id is not null then
    update slots
    set booked = coalesce(booked, 0) + 1
    where id::text = new.slot_id::text;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."bump_slot_on_booking"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unbump_slot_on_cancel"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if old.status is distinct from new.status
     and new.status = 'cancelled'
     and old.slot_id is not null then
    update slots
    set booked = greatest(coalesce(booked, 0) - 1, 0)
    where id::text = old.slot_id::text;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."unbump_slot_on_cancel"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_extractions" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "business_id" bigint,
    "input_kind" "text" NOT NULL,
    "model" "text" NOT NULL,
    "raw_json" "jsonb",
    "raw_text" "text",
    "error" "text",
    "admin_user_id" "uuid",
    CONSTRAINT "admin_extractions_input_kind_check" CHECK (("input_kind" = ANY (ARRAY['image'::"text", 'pdf'::"text", 'text'::"text"])))
);


ALTER TABLE "public"."admin_extractions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."admin_extractions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."admin_extractions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."admin_extractions_id_seq" OWNED BY "public"."admin_extractions"."id";



CREATE TABLE IF NOT EXISTS "public"."admin_magic_link_log" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "admin_user_id" "uuid",
    "business_id" bigint,
    "business_email" "text",
    "success" boolean DEFAULT true NOT NULL,
    "error" "text"
);


ALTER TABLE "public"."admin_magic_link_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."admin_magic_link_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."admin_magic_link_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."admin_magic_link_log_id_seq" OWNED BY "public"."admin_magic_link_log"."id";



CREATE TABLE IF NOT EXISTS "public"."admin_ownership_transfers" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "admin_user_id" "uuid",
    "business_id" bigint,
    "from_email" "text",
    "to_email" "text",
    "cleared_user_id" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."admin_ownership_transfers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."admin_ownership_transfers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."admin_ownership_transfers_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."admin_ownership_transfers_id_seq" OWNED BY "public"."admin_ownership_transfers"."id";



CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "business_id" bigint,
    "venue_id" bigint,
    "slot_id" "text",
    "booking_date" "date",
    "start_time" "text",
    "duration" "text",
    "credits_used" integer,
    "status" "text" DEFAULT 'pending'::"text",
    "acuity_appointment_id" "text",
    "peak_flag" boolean DEFAULT false,
    "notes" "text",
    "safety_cancel_token" "text",
    "safety_cancel_expires_at" timestamp with time zone,
    "safety_cancelled_at" timestamp with time zone,
    "payout_transfer_id" "text",
    "payout_at" timestamp with time zone,
    "offering_type" "text",
    "venue_accept_token" "text",
    "venue_decline_token" "text",
    "venue_action_expires_at" timestamp with time zone,
    CONSTRAINT "bookings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'pending_instructor'::"text", 'pending_venue'::"text", 'confirmed'::"text", 'acuity_sync_failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."businesses" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "category" "text",
    "location" "text",
    "email" "text",
    "phone" "text",
    "status" "text",
    "notes" "text",
    "commission" "text" DEFAULT 'standard'::"text",
    "description" "text",
    "address" "text",
    "website" "text",
    "instagram" "text",
    "gallery" "jsonb" DEFAULT '[]'::"jsonb",
    "acuity_key" "text",
    "onboarding_step" integer DEFAULT 0,
    "integration_request" "text",
    "price_mode" "text",
    "bank_account_name" "text",
    "iban" "text",
    "bic" "text",
    "img" "text",
    "slots" "jsonb" DEFAULT '[]'::"jsonb",
    "cr" integer,
    "acuity_user_id" "text",
    "acuity_appointment_types" "jsonb" DEFAULT '[]'::"jsonb",
    "commission_peak" numeric DEFAULT 0.15,
    "commission_offpeak" numeric DEFAULT 0.15,
    "mindbody_site_id" "text",
    "ical_url" "text",
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "user_id" "uuid",
    "bio" "text",
    "lat" numeric,
    "lng" numeric,
    "travel_radius_km" integer,
    "availability_windows" "jsonb" DEFAULT '[]'::"jsonb",
    "session_duration_min" integer DEFAULT 60,
    "coverage_areas" "jsonb" DEFAULT '[]'::"jsonb",
    "business_type" "text",
    "session_offerings" "jsonb" DEFAULT '[]'::"jsonb",
    "availability_from" "date",
    "availability_to" "date",
    "commission_rate" numeric,
    "founding_partner" boolean DEFAULT false,
    "founding_incentive_bookings" integer,
    "terms_accepted_at" timestamp with time zone,
    "terms_version" "text",
    "terms_accepted_commission" numeric,
    "cancellation_safety_window" boolean DEFAULT false,
    "travel_areas" "jsonb",
    "travel_fee_eur" integer,
    "stripe_account_id" "text",
    "stripe_account_status" "text",
    "contact_name" "text",
    "session_categories" "text"[],
    "bookings_whatsapp" "text",
    "class_photos" "jsonb"
);


ALTER TABLE "public"."businesses" OWNER TO "postgres";


COMMENT ON COLUMN "public"."businesses"."class_photos" IS 'Optional map keyed by class name (matches slots[].name) → photo URL. Used to render class-specific photos on the marketplace where a slot appears. Falls back to businesses.img when the key is absent.';



ALTER TABLE "public"."businesses" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."businesses_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."gifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "credits" integer NOT NULL,
    "sender_email" "text" NOT NULL,
    "sender_name" "text",
    "recipient_email" "text",
    "recipient_name" "text",
    "message" "text",
    "status" "text" DEFAULT 'pending_payment'::"text" NOT NULL,
    "claimed_by_user_id" "uuid",
    "claimed_at" timestamp with time zone,
    "stripe_session_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gifts_credits_check" CHECK (("credits" > 0)),
    CONSTRAINT "gifts_status_check" CHECK (("status" = ANY (ARRAY['pending_payment'::"text", 'available'::"text", 'claimed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."gifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listings" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "cat" "text" NOT NULL,
    "cat2" "text",
    "loc" "text" NOT NULL,
    "description" "text",
    "img" "text",
    "rating" numeric(2,1) DEFAULT 4.5,
    "reviews" integer DEFAULT 0,
    "cr" integer DEFAULT 3,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "status" "text" DEFAULT 'active'::"text",
    "business_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "coverage_areas" "jsonb" DEFAULT '[]'::"jsonb",
    "travel_areas" "jsonb",
    "travel_fee_eur" integer,
    "session_categories" "text"[]
);


ALTER TABLE "public"."listings" OWNER TO "postgres";


ALTER TABLE "public"."listings" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."listings_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."partner_invites" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "admin_user_id" "uuid",
    "business_id" bigint,
    "code" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone
);


ALTER TABLE "public"."partner_invites" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."partner_invites_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."partner_invites_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."partner_invites_id_seq" OWNED BY "public"."partner_invites"."id";



CREATE TABLE IF NOT EXISTS "public"."payout_log" (
    "id" bigint NOT NULL,
    "run_id" "uuid" NOT NULL,
    "business_id" bigint,
    "status" "text" NOT NULL,
    "reason" "text",
    "gross_cents" bigint,
    "commission_cents" bigint,
    "net_cents" bigint,
    "stripe_transfer_id" "text",
    "statement_path" "text",
    "statement_email_status" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "booking_ids" "uuid"[],
    CONSTRAINT "payout_log_status_check" CHECK (("status" = ANY (ARRAY['paid'::"text", 'skipped'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."payout_log" OWNER TO "postgres";


ALTER TABLE "public"."payout_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."payout_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "credits" integer DEFAULT 0,
    "interests" "jsonb" DEFAULT '[]'::"jsonb",
    "phone" "text",
    "consumer_terms_version" "text",
    "consumer_terms_accepted_at" timestamp with time zone
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."slots" (
    "id" bigint NOT NULL,
    "listing_id" bigint,
    "name" "text" NOT NULL,
    "date" "date" NOT NULL,
    "time" "text" NOT NULL,
    "dur" "text" DEFAULT '60 min'::"text",
    "spots" integer DEFAULT 10,
    "booked" integer DEFAULT 0,
    "credits" integer DEFAULT 3,
    "live" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "paused" boolean DEFAULT false,
    "acuity_type_id" "text",
    "category" "text"
);


ALTER TABLE "public"."slots" OWNER TO "postgres";


ALTER TABLE "public"."slots" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."slots_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."admin_extractions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."admin_extractions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."admin_magic_link_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."admin_magic_link_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."admin_ownership_transfers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."admin_ownership_transfers_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."partner_invites" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."partner_invites_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."admin_extractions"
    ADD CONSTRAINT "admin_extractions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_magic_link_log"
    ADD CONSTRAINT "admin_magic_link_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_ownership_transfers"
    ADD CONSTRAINT "admin_ownership_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gifts"
    ADD CONSTRAINT "gifts_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."gifts"
    ADD CONSTRAINT "gifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gifts"
    ADD CONSTRAINT "gifts_stripe_session_id_key" UNIQUE ("stripe_session_id");



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partner_invites"
    ADD CONSTRAINT "partner_invites_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."partner_invites"
    ADD CONSTRAINT "partner_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payout_log"
    ADD CONSTRAINT "payout_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."slots"
    ADD CONSTRAINT "slots_pkey" PRIMARY KEY ("id");



CREATE INDEX "admin_extractions_business_id_idx" ON "public"."admin_extractions" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "admin_magic_link_log_business_id_idx" ON "public"."admin_magic_link_log" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "admin_ownership_transfers_business_id_idx" ON "public"."admin_ownership_transfers" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "bookings_payout_pending_idx" ON "public"."bookings" USING "btree" ("business_id") WHERE (("payout_at" IS NULL) AND ("status" = 'confirmed'::"text"));



CREATE INDEX "bookings_status_created_idx" ON "public"."bookings" USING "btree" ("status", "created_at") WHERE ("status" = 'pending_instructor'::"text");



CREATE INDEX "bookings_venue_accept_token_idx" ON "public"."bookings" USING "btree" ("venue_accept_token") WHERE ("venue_accept_token" IS NOT NULL);



CREATE INDEX "bookings_venue_decline_token_idx" ON "public"."bookings" USING "btree" ("venue_decline_token") WHERE ("venue_decline_token" IS NOT NULL);



CREATE INDEX "businesses_session_categories_gin_idx" ON "public"."businesses" USING "gin" ("session_categories");



CREATE INDEX "gifts_code_idx" ON "public"."gifts" USING "btree" ("code");



CREATE INDEX "gifts_status_idx" ON "public"."gifts" USING "btree" ("status");



CREATE INDEX "listings_session_categories_gin_idx" ON "public"."listings" USING "gin" ("session_categories");



CREATE INDEX "partner_invites_business_idx" ON "public"."partner_invites" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "partner_invites_code_idx" ON "public"."partner_invites" USING "btree" ("code") WHERE ("used_at" IS NULL);



CREATE INDEX "payout_log_business_created_idx" ON "public"."payout_log" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "payout_log_run_idx" ON "public"."payout_log" USING "btree" ("run_id");



CREATE INDEX "slots_category_date_idx" ON "public"."slots" USING "btree" ("category", "date");



CREATE OR REPLACE TRIGGER "booking-webhook" AFTER INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://esocyyhnphjqcfjidffu.supabase.co/functions/v1/booking-webhook', 'POST', '{"Content-type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzb2N5eWhucGhqcWNmamlkZmZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyNDc3MCwiZXhwIjoyMDkwODAwNzcwfQ.ogDYqAGjaWydZBf_nm6deaW0517ggnY49Qia3Ei9-Lg"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "booking_cancelled_unbump_slot" AFTER UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."unbump_slot_on_cancel"();



CREATE OR REPLACE TRIGGER "booking_inserted_bump_slot" AFTER INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."bump_slot_on_booking"();



CREATE OR REPLACE TRIGGER "bookings_safety_window_trigger" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."bookings_safety_window_check"();



CREATE OR REPLACE TRIGGER "notify-partner-registration" AFTER INSERT ON "public"."businesses" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://esocyyhnphjqcfjidffu.supabase.co/functions/v1/notify-partner-registration', 'POST', '{"Content-type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzb2N5eWhucGhqcWNmamlkZmZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyNDc3MCwiZXhwIjoyMDkwODAwNzcwfQ.ogDYqAGjaWydZBf_nm6deaW0517ggnY49Qia3Ei9-Lg"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "notify-partner-status" AFTER UPDATE ON "public"."businesses" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://esocyyhnphjqcfjidffu.supabase.co/functions/v1/notify-partner-status', 'POST', '{"Content-type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzb2N5eWhucGhqcWNmamlkZmZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyNDc3MCwiZXhwIjoyMDkwODAwNzcwfQ.ogDYqAGjaWydZBf_nm6deaW0517ggnY49Qia3Ei9-Lg"}', '{}', '5000');



ALTER TABLE ONLY "public"."admin_extractions"
    ADD CONSTRAINT "admin_extractions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_magic_link_log"
    ADD CONSTRAINT "admin_magic_link_log_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_ownership_transfers"
    ADD CONSTRAINT "admin_ownership_transfers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."businesses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gifts"
    ADD CONSTRAINT "gifts_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_invites"
    ADD CONSTRAINT "partner_invites_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payout_log"
    ADD CONSTRAINT "payout_log_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."slots"
    ADD CONSTRAINT "slots_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



CREATE POLICY "Anon can read safe business fields for active listings" ON "public"."businesses" FOR SELECT TO "authenticated", "anon" USING ((("status" = 'approved'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."business_id" = "businesses"."id") AND ("listings"."status" = 'active'::"text"))))));



CREATE POLICY "Customers can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Deny all direct access" ON "public"."gifts" USING (false) WITH CHECK (false);



CREATE POLICY "Partners can delete own slots" ON "public"."slots" FOR DELETE TO "authenticated" USING (("listing_id" IN ( SELECT "l"."id"
   FROM ("public"."listings" "l"
     JOIN "public"."businesses" "b" ON (("b"."id" = "l"."business_id")))
  WHERE (("b"."user_id" = "auth"."uid"()) OR (("b"."user_id" IS NULL) AND ("lower"("b"."email") = "lower"("auth"."email"())))))));



CREATE POLICY "Partners can delete own venue" ON "public"."businesses" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Partners can insert own slots" ON "public"."slots" FOR INSERT TO "authenticated" WITH CHECK (("listing_id" IN ( SELECT "l"."id"
   FROM ("public"."listings" "l"
     JOIN "public"."businesses" "b" ON (("b"."id" = "l"."business_id")))
  WHERE (("b"."user_id" = "auth"."uid"()) OR (("b"."user_id" IS NULL) AND ("lower"("b"."email") = "lower"("auth"."email"())))))));



CREATE POLICY "Partners can read bookings for their venue" ON "public"."bookings" FOR SELECT TO "authenticated" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE (("businesses"."user_id" = "auth"."uid"()) OR (("businesses"."user_id" IS NULL) AND ("lower"("businesses"."email") = "lower"("auth"."email"())))))));



CREATE POLICY "Partners can read own business" ON "public"."businesses" FOR SELECT TO "authenticated" USING (("email" = ("auth"."jwt"() ->> 'email'::"text")));



CREATE POLICY "Partners can read own business record" ON "public"."businesses" FOR SELECT TO "authenticated" USING (("email" = ("auth"."jwt"() ->> 'email'::"text")));



CREATE POLICY "Partners can read own slots" ON "public"."slots" FOR SELECT TO "authenticated" USING (("listing_id" IN ( SELECT "l"."id"
   FROM ("public"."listings" "l"
     JOIN "public"."businesses" "b" ON (("b"."id" = "l"."business_id")))
  WHERE (("b"."user_id" = "auth"."uid"()) OR (("b"."user_id" IS NULL) AND ("lower"("b"."email") = "lower"("auth"."email"())))))));



CREATE POLICY "Partners can update own business" ON "public"."businesses" FOR UPDATE TO "authenticated" USING (("email" = ("auth"."jwt"() ->> 'email'::"text")));



CREATE POLICY "Partners can update own listing" ON "public"."listings" FOR UPDATE TO "authenticated" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE (("businesses"."user_id" = "auth"."uid"()) OR (("businesses"."user_id" IS NULL) AND ("lower"("businesses"."email") = "lower"("auth"."email"()))))))) WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE (("businesses"."user_id" = "auth"."uid"()) OR (("businesses"."user_id" IS NULL) AND ("lower"("businesses"."email") = "lower"("auth"."email"())))))));



CREATE POLICY "Partners can update own slots" ON "public"."slots" FOR UPDATE TO "authenticated" USING (("listing_id" IN ( SELECT "l"."id"
   FROM ("public"."listings" "l"
     JOIN "public"."businesses" "b" ON (("b"."id" = "l"."business_id")))
  WHERE (("b"."user_id" = "auth"."uid"()) OR (("b"."user_id" IS NULL) AND ("lower"("b"."email") = "lower"("auth"."email"()))))))) WITH CHECK (("listing_id" IN ( SELECT "l"."id"
   FROM ("public"."listings" "l"
     JOIN "public"."businesses" "b" ON (("b"."id" = "l"."business_id")))
  WHERE (("b"."user_id" = "auth"."uid"()) OR (("b"."user_id" IS NULL) AND ("lower"("b"."email") = "lower"("auth"."email"())))))));



CREATE POLICY "Public can read active listings" ON "public"."listings" FOR SELECT TO "anon" USING (("status" = 'active'::"text"));



CREATE POLICY "Public read listings" ON "public"."listings" FOR SELECT USING (true);



CREATE POLICY "Public read slots" ON "public"."slots" FOR SELECT USING (true);



CREATE POLICY "Users can insert own bookings" ON "public"."bookings" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Users can read own bookings" ON "public"."bookings" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "allow public inserts" ON "public"."businesses" FOR INSERT WITH CHECK (true);



ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."businesses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gifts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."slots" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."bookings_safety_window_check"() TO "anon";
GRANT ALL ON FUNCTION "public"."bookings_safety_window_check"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bookings_safety_window_check"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bump_slot_on_booking"() TO "anon";
GRANT ALL ON FUNCTION "public"."bump_slot_on_booking"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_slot_on_booking"() TO "service_role";



GRANT ALL ON FUNCTION "public"."unbump_slot_on_cancel"() TO "anon";
GRANT ALL ON FUNCTION "public"."unbump_slot_on_cancel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."unbump_slot_on_cancel"() TO "service_role";



GRANT ALL ON TABLE "public"."admin_extractions" TO "anon";
GRANT ALL ON TABLE "public"."admin_extractions" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_extractions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."admin_extractions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."admin_extractions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."admin_extractions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."admin_magic_link_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_magic_link_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_magic_link_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."admin_magic_link_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."admin_magic_link_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."admin_magic_link_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."admin_ownership_transfers" TO "anon";
GRANT ALL ON TABLE "public"."admin_ownership_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_ownership_transfers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."admin_ownership_transfers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."admin_ownership_transfers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."admin_ownership_transfers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."businesses" TO "anon";
GRANT ALL ON TABLE "public"."businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."businesses" TO "service_role";



GRANT ALL ON SEQUENCE "public"."businesses_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."businesses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."businesses_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gifts" TO "anon";
GRANT ALL ON TABLE "public"."gifts" TO "authenticated";
GRANT ALL ON TABLE "public"."gifts" TO "service_role";



GRANT ALL ON TABLE "public"."listings" TO "anon";
GRANT ALL ON TABLE "public"."listings" TO "authenticated";
GRANT ALL ON TABLE "public"."listings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."listings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."listings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."listings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."partner_invites" TO "anon";
GRANT ALL ON TABLE "public"."partner_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_invites" TO "service_role";



GRANT ALL ON SEQUENCE "public"."partner_invites_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."partner_invites_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."partner_invites_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."payout_log" TO "anon";
GRANT ALL ON TABLE "public"."payout_log" TO "authenticated";
GRANT ALL ON TABLE "public"."payout_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."payout_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."payout_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payout_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."slots" TO "anon";
GRANT ALL ON TABLE "public"."slots" TO "authenticated";
GRANT ALL ON TABLE "public"."slots" TO "service_role";



GRANT ALL ON SEQUENCE "public"."slots_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."slots_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."slots_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







