/* Supabase 연동 레이어. 바닐라 JS + ESM import(브라우저 네이티브 모듈)로 로드됩니다.
   사용하는 모든 페이지는 <script type="module" src="js/supabase.js">와
   <script type="module" src="js/app-*.js"> 조합으로 동작합니다 (common.js의 UI 전역은 그대로 유지). */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://czwihlcyasfdhlutfbxa.supabase.co';
// publishable/anon 키는 RLS로 보호되는 공개 클라이언트 키이며 노출되어도 안전합니다.
const SUPABASE_ANON_KEY = 'sb_publishable_SIFeKpWIs4iixzoY5eFjRA_0ZpLhz6H';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

const AVATAR_BUCKET = 'avatars';
const POST_BUCKET = 'posts';

/* ---------- 세션 / 프로필 ---------- */

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function requireSession(redirectTo = 'login.html') {
  const session = await getSession();
  if (!session) {
    location.href = redirectTo;
    return null;
  }
  return session;
}

export async function getMyProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (error) throw error;
  return data;
}

export async function getProfileByUsername(username) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single();
  if (error) throw error;
  return data;
}

export async function updateMyProfile({ display_name, bio, avatar_url }) {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요해요.');
  const patch = {};
  if (display_name !== undefined) patch.display_name = display_name;
  if (bio !== undefined) patch.bio = bio;
  if (avatar_url !== undefined) patch.avatar_url = avatar_url;
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', session.user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ---------- 인증 ---------- */

export async function signUp({ email, password, username }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

/* ---------- 게시글 (feed_posts 뷰: 좋아요/댓글 집계 + liked_by_me 포함) ---------- */

export async function fetchFeed({ from = 0, to = 9 } = {}) {
  const { data, error } = await supabase
    .from('feed_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;
  return data;
}

export async function fetchPost(id) {
  const { data, error } = await supabase
    .from('feed_posts')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchPostsByUsername(username) {
  const { data, error } = await supabase
    .from('feed_posts')
    .select('*')
    .eq('author_username', username)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createPost({ caption, file }) {
  const session = await requireSession();
  if (!session) return null;
  let image_path = null;
  if (file) {
    image_path = await uploadPostImage(session.user.id, file);
  }
  const { data, error } = await supabase
    .from('posts')
    .insert({ author_id: session.user.id, caption: caption || null, image_path })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePostCaption(id, caption) {
  const { data, error } = await supabase
    .from('posts')
    .update({ caption })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePost(id) {
  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- 댓글 ---------- */

export async function fetchComments(postId) {
  const { data, error } = await supabase
    .from('comments')
    .select('id, post_id, author_id, content, created_at, updated_at, profiles:author_id(username, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function addComment(postId, content) {
  const session = await requireSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: postId, author_id: session.user.id, content })
    .select('id, post_id, author_id, content, created_at, updated_at, profiles:author_id(username, avatar_url)')
    .single();
  if (error) throw error;
  return data;
}

export async function updateComment(id, content) {
  const { data, error } = await supabase
    .from('comments')
    .update({ content })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteComment(id) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- 좋아요 ---------- */

export async function likePost(postId) {
  const session = await requireSession();
  if (!session) return;
  const { error } = await supabase
    .from('likes')
    .insert({ post_id: postId, user_id: session.user.id });
  // 중복 좋아요(unique violation)는 이미 눌린 상태로 간주하고 무시
  if (error && error.code !== '23505') throw error;
}

export async function unlikePost(postId) {
  const session = await requireSession();
  if (!session) return;
  const { error } = await supabase
    .from('likes')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', session.user.id);
  if (error) throw error;
}

/* ---------- Storage ---------- */

export async function uploadPostImage(userId, file) {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(POST_BUCKET).upload(path, file, {
    contentType: file.type,
  });
  if (error) throw error;
  return path;
}

export async function uploadAvatar(userId, file) {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/avatar.${ext}`;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw error;
  return publicPostUrl(AVATAR_BUCKET, path);
}

export function publicPostUrl(bucket, path) {
  if (!path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export function postImageUrl(path) {
  return publicPostUrl(POST_BUCKET, path);
}

/* ---------- 레이아웃 헤더 동기화 ----------
   모든 페이지 공통: 세션을 확인해 상단바/하단탭의 프로필 링크·아바타를 갱신합니다.
   로그인된 경우의 profile을 반환하므로 호출부에서 재사용할 수 있습니다. */
export async function initHeader() {
  try {
    const profile = await getMyProfile();
    window.UI?.setHeaderUser(profile || null);
    return profile;
  } catch (e) {
    window.UI?.setHeaderUser(null);
    return null;
  }
}

/* ---------- 표시용 포맷 헬퍼 ---------- */

export function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return day === 1 ? '어제' : `${day}일 전`;
  return `${Math.floor(day / 7)}주 전`;
}
