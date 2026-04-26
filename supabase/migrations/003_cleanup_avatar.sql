-- 清理已废弃的头像功能残留
-- 幂等执行：未创建过头像 bucket/字段的环境也可安全运行

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_insert_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;

delete from storage.objects
where bucket_id = 'avatars';

delete from storage.buckets
where id = 'avatars';

alter table public.profiles
  drop column if exists avatar_path;
