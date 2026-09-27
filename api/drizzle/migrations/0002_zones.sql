CREATE TYPE "public"."road_class" AS ENUM('nasional', 'nasional_provinsi', 'semua');--> statement-breakpoint
CREATE TYPE "public"."zone_status" AS ENUM('collecting', 'paused');--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"road_class" "road_class" NOT NULL,
	"status" "zone_status" DEFAULT 'collecting' NOT NULL,
	"roads_count" integer,
	"length_km" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zones_user_id_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "zones_user_id_idx" ON "zones" USING btree ("user_id");