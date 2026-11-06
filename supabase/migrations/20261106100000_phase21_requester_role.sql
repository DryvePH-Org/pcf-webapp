-- Commit the enum addition before any functions use its value.
alter type public.user_role add value if not exists 'requester';
