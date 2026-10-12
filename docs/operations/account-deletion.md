# Runbook: closing an account on request

Terms §7 and Privacy §4–5 promise that when someone emails **support.maceut@hokya.dev from
their registered address**, their account and personal data are deleted **within 30 days**,
except what the law requires us to keep. There is no self-service button. This is the manual
procedure, run by a superadmin.

The admin delete (`DELETE /internal/users/:id`, the Delete button on the staff Users page)
removes every database row tied to the account. It does **not** remove the account's files in
R2, its email delivery records, or leftover sign-in codes. Steps 4 and 5 cover those.

| Where | Removed by the admin delete? |
|---|---|
| `user`, `account`, `session`, `user_plans` | Yes (cascade) |
| `zones`, `schedules`, `captures`, `exports`, `render_cache` | Yes (cascade) |
| `notifications`, `notification_preferences` | Yes (cascade) |
| `platform_settings.updated_by` | Set to null, the setting stays |
| R2 `captures/{user_id}/…` (images, `.thumb.jpg`) | **No** (step 4) |
| R2 `exports/{user_id}/…` (ZIP, MP4, WebM) | **No** (step 4) |
| R2 `render-cache/{user_id}/…` (frames, kept 7 days) | **No** (step 4) |
| `email_log` rows for the address (no user FK) | **No** (step 5) |
| `verification` rows (sign-up / reset codes keyed by email) | **No** (step 5) |

## 1. Verify the request (day 0)

1. The request must come **from the registered address**. Find it: Staff → Users → search
   the email. If no account has that address, reply that none was found and stop.
2. Email headers can be forged. Reply **to the registered address** (not "reply all", not
   another address in the thread) and ask them to confirm by answering that email. Delete
   only after the confirmation arrives from that address.
3. Write down in the log (step 7): date received, date confirmed, email, user id. The
   30-day clock starts on the date the request was received.

## 2. Check what must be kept

The Terms keep "what the law requires us to keep". Today Maceut takes no payments, so there are
no invoices or tax records. If billing exists by the time you run this, keep the
billing records the law requires, separately, and note which ones in the log.

## 3. Delete the account

Staff → Users → the account's menu → **Delete account** (superadmin only). Write down the counts it reports
(zones and windows removed). This stops the account's capture windows at once, so no new
files are written for it.

Wait **5 minutes** before step 4. A capture or export already being rendered can still
upload one last file.

## 4. Delete the account's files in R2

Use the user id from step 1. With any S3-compatible client pointed at R2 (the values are in
`api/.env`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_ACCESS_KEY_SECRET`, `R2_BUCKET_NAME`).
Example with the AWS CLI:

```bash
export AWS_ACCESS_KEY_ID=…  AWS_SECRET_ACCESS_KEY=…
R2="--endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com"
B=s3://<R2_BUCKET_NAME>
U=<user_id>

# See what is there first, then delete.
aws s3 ls $B/captures/$U/ --recursive $R2 | wc -l
aws s3 ls $B/exports/$U/ --recursive $R2 | wc -l
aws s3 ls $B/render-cache/$U/ --recursive $R2 | wc -l

aws s3 rm $B/captures/$U/ --recursive $R2
aws s3 rm $B/exports/$U/ --recursive $R2
aws s3 rm $B/render-cache/$U/ --recursive $R2

# All three must now list nothing.
aws s3 ls $B/captures/$U/ --recursive $R2
aws s3 ls $B/exports/$U/ --recursive $R2
aws s3 ls $B/render-cache/$U/ --recursive $R2
```

Write down how many files each prefix held.

## 5. Delete the email records and leftover codes

In the database (`docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"`),
with the address in lower case:

```sql
-- How many, first.
SELECT count(*) FROM email_log    WHERE lower("to") = lower('<email>');
SELECT count(*) FROM verification WHERE identifier LIKE '%-otp-' || lower('<email>');

DELETE FROM email_log    WHERE lower("to") = lower('<email>');
DELETE FROM verification WHERE identifier LIKE '%-otp-' || lower('<email>');

-- Nothing left with this address or id.
SELECT count(*) FROM "user"    WHERE lower(email) = lower('<email>');
SELECT count(*) FROM email_log WHERE lower("to") = lower('<email>');
SELECT count(*) FROM captures  WHERE user_id = '<user_id>';
```

## 6. Confirm to the person

Reply to the registered address: the account and its data have been deleted, with the date.
Keep the reply short and don't attach anything from the account.

## 7. Record it

Keep one line per request in the operator log (not in the app, which no longer has the
account): received, confirmed, deleted (date), user id, email, rows and files removed per
step, anything kept under step 2 and why. This is the evidence that the 30-day promise was
kept. The log itself holds an email address: keep it only as long as the law requires.

## Not covered here

- **Database backups.** Deleted rows survive in backups until those backups expire. The
  backup retention period is not decided yet; the Privacy policy should match it once it is.
- **HERE Technologies** receives zone coordinates, never identity, and we hold nothing at
  HERE to delete.
- **Self-service deletion** in the app is out of scope.
