CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" varchar(32) NOT NULL,
	"path" text,
	"size" bigint,
	"source" varchar(16) NOT NULL,
	"ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth0_sub" varchar(255) NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(255),
	"sftpgo_username" varchar(320),
	"ssh_pubkey" text,
	"storage_quota_bytes" bigint DEFAULT 314572800,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth0_sub_unique" UNIQUE("auth0_sub"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_sftpgo_username_unique" UNIQUE("sftpgo_username")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;