-- Delivery doc F3: a Starter plan between Free and Standard. Placed before 'standard' so
-- the enum keeps the plans cheapest to dearest, like PLANS in api/src/types/plan.ts.
-- No existing row changes plan.
ALTER TYPE "public"."plan" ADD VALUE IF NOT EXISTS 'starter' BEFORE 'standard';
