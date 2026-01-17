CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"address" varchar(42) NOT NULL,
	"chain_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"provider" varchar(50) DEFAULT 'polymarket_clob' NOT NULL,
	"encrypted_blob" text NOT NULL,
	"iv" varchar(32) NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "markets" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"slug" varchar(255) NOT NULL,
	"question" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"closed" boolean DEFAULT false NOT NULL,
	"metadata_json" jsonb,
	"end_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"market_id" varchar(100) NOT NULL,
	"name" varchar(100) NOT NULL,
	"yes_token_id" varchar(100) NOT NULL,
	"no_token_id" varchar(100) NOT NULL,
	"yes_limit_price" numeric(10, 6) NOT NULL,
	"no_limit_price" numeric(10, 6) NOT NULL,
	"yes_size" numeric(18, 6) NOT NULL,
	"no_size" numeric(18, 6) NOT NULL,
	"frequency_seconds" integer NOT NULL,
	"max_runs" integer,
	"runs_completed" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"min_liquidity_usdc" numeric(18, 2) NOT NULL,
	"max_slippage_from_midpoint" numeric(5, 4) NOT NULL,
	"leg_timeout_ms" integer NOT NULL,
	"auto_cash_out" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trade_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"idempotency_key" varchar(64) NOT NULL,
	"entry_yes_cost" numeric(18, 6),
	"entry_no_cost" numeric(18, 6),
	"exit_yes_proceeds" numeric(18, 6),
	"exit_no_proceeds" numeric(18, 6),
	"fees_total" numeric(18, 6),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_runs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_run_id" uuid NOT NULL,
	"clob_order_id" varchar(100),
	"client_order_id" varchar(100) NOT NULL,
	"token_id" varchar(100) NOT NULL,
	"side" varchar(10) NOT NULL,
	"price" numeric(10, 6) NOT NULL,
	"size" numeric(18, 6) NOT NULL,
	"filled_size" numeric(18, 6) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"placed_at" timestamp with time zone,
	"filled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_clob_order_id_unique" UNIQUE("clob_order_id"),
	CONSTRAINT "orders_client_order_id_unique" UNIQUE("client_order_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"clob_trade_id" varchar(100) NOT NULL,
	"price" numeric(10, 6) NOT NULL,
	"size" numeric(18, 6) NOT NULL,
	"fee" numeric(18, 6) DEFAULT '0' NOT NULL,
	"filled_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fills_clob_trade_id_unique" UNIQUE("clob_trade_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_id" varchar(100) NOT NULL,
	"market_id" varchar(100) NOT NULL,
	"size" numeric(18, 6) DEFAULT '0' NOT NULL,
	"avg_entry_price" numeric(10, 6) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_user_token_unique" UNIQUE("user_id","token_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pnl_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"market_id" varchar(100) NOT NULL,
	"date" date NOT NULL,
	"pnl" numeric(18, 6) DEFAULT '0' NOT NULL,
	"volume" numeric(18, 6) DEFAULT '0' NOT NULL,
	"fees" numeric(18, 6) DEFAULT '0' NOT NULL,
	"trades_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pnl_records_user_market_date_unique" UNIQUE("user_id","market_id","date")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_id_idx" ON "refresh_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_token_hash_idx" ON "refresh_tokens" ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallets_user_id_idx" ON "wallets" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_credentials_user_id_idx" ON "user_credentials" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_credentials_user_revoked_idx" ON "user_credentials" ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "markets_active_idx" ON "markets" ("active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "markets_updated_at_idx" ON "markets" ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "markets_slug_idx" ON "markets" ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strategies_user_id_idx" ON "strategies" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strategies_user_enabled_idx" ON "strategies" ("user_id","enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strategies_next_run_at_idx" ON "strategies" ("next_run_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_runs_strategy_id_idx" ON "trade_runs" ("strategy_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_runs_user_id_idx" ON "trade_runs" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_runs_user_scheduled_idx" ON "trade_runs" ("user_id","scheduled_for");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_runs_status_idx" ON "trade_runs" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_trade_run_id_idx" ON "orders" ("trade_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fills_order_id_idx" ON "fills" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fills_filled_at_idx" ON "fills" ("filled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "positions_user_id_idx" ON "positions" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pnl_records_user_id_idx" ON "pnl_records" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pnl_records_date_idx" ON "pnl_records" ("date");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "strategies" ADD CONSTRAINT "strategies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "strategies" ADD CONSTRAINT "strategies_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_runs" ADD CONSTRAINT "trade_runs_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "strategies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_runs" ADD CONSTRAINT "trade_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_trade_run_id_trade_runs_id_fk" FOREIGN KEY ("trade_run_id") REFERENCES "trade_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fills" ADD CONSTRAINT "fills_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "positions" ADD CONSTRAINT "positions_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pnl_records" ADD CONSTRAINT "pnl_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pnl_records" ADD CONSTRAINT "pnl_records_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
