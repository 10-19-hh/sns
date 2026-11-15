/* 공통 UI 레이어: 아이콘, 레이아웃(상단바/하단탭), 모달/토스트, 피드 카드 렌더링.
   Supabase 호출은 전혀 모르는 순수 UI 모듈입니다 — 실제 데이터는 각 페이지의
   모듈 스크립트가 js/supabase.js로 가져와서 아래 렌더러에 "정규화된 모양"으로 넘겨줍니다.
   정규화된 post 모양: { id, authorUsername, authorAvatar, imageUrl, caption, edited,
                         timeLabel, likeCount, liked, commentCount, isMine } */
(function () {
  /* ---------- 아이콘 ---------- */
  const I = {
    home: '<svg class="fillable" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M12 8v8M8 12h8"/></svg>',
    user: '<svg class="fillable" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" stroke-linecap="round"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20.5s-8-4.9-8-11A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8 2.8c0 6.1-8 11-8 11z"/></svg>',
    heartFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.5s-8-4.9-8-11A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8 2.8c0 6.1-8 11-8 11z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1.5-4.4A8.5 8.5 0 1 1 20.5 11.5z"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  };

  /* ---------- 유틸 ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => (s == null ? '' : String(s)).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const qs = (k) => new URLSearchParams(location.search).get(k);

  /* ---------- 오버레이 ---------- */
  function openOverlay(html, cls = '') {
    const el = document.createElement('div');
    el.className = 'overlay ' + cls;
    el.innerHTML = html;
    el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
    document.body.appendChild(el);
    return el;
  }
  function confirmModal({ title, message, okText = '확인', danger = false }, onOk) {
    const el = openOverlay(`<div class="modal" role="dialog" aria-modal="true">
      <div class="body"><h3>${esc(title)}</h3><p>${esc(message)}</p></div>
      <div class="row"><button data-x>취소</button><button data-ok class="${danger ? 'danger' : ''}">${esc(okText)}</button></div></div>`);
    $('[data-x]', el).onclick = () => el.remove();
    $('[data-ok]', el).onclick = () => { el.remove(); onOk && onOk(); };
  }
  function actionSheet(items) {
    const el = openOverlay(`<div class="action-sheet" role="dialog" aria-modal="true">
      <div class="group">${items.map((it, i) => `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${esc(it.label)}</button>`).join('')}</div>
      <button class="cancel" data-x>취소</button></div>`, 'sheet');
    $('[data-x]', el).onclick = () => el.remove();
    $$('[data-i]', el).forEach((b) => (b.onclick = () => { el.remove(); items[b.dataset.i].onClick(); }));
  }
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  /* ---------- 레이아웃 (상단 바 + 하단 탭) ----------
     로그인 상태를 모르는 시점에 먼저 그려두고, 세션 확인이 끝나면
     setHeaderUser(profile|null)로 아바타/링크를 갱신합니다. */
  function renderChrome() {
    const page = document.body.dataset.page;
    const bar = document.createElement('header');
    bar.className = 'topbar';
    bar.innerHTML = `<div class="topbar-inner">
      <a href="index.html" class="logo" aria-label="홈">Moment<span>.</span></a>
      <nav class="nav" aria-label="주 메뉴">
        <a class="icon-btn nav-desktop" href="index.html" aria-label="홈">${I.home}</a>
        <a class="icon-btn nav-desktop" href="new.html" aria-label="새 게시글">${I.plus}</a>
        <a id="nav-user-link" class="icon-btn" href="login.html" aria-label="프로필">${I.user}</a>
      </nav></div>`;
    document.body.prepend(bar);

    const tab = document.createElement('nav');
    tab.className = 'tabbar';
    tab.setAttribute('aria-label', '하단 메뉴');
    const cls = (n) => 'icon-btn' + (page === n ? ' active' : '');
    tab.innerHTML = `<div class="tabbar-inner">
      <a class="${cls('home')}" href="index.html" aria-label="홈">${I.home}</a>
      <a class="${cls('new')}" href="new.html" aria-label="새 게시글">${I.plus}</a>
      <a id="tab-user-link" class="${cls('profile')}" href="login.html" aria-label="프로필">${I.user}</a></div>`;
    document.body.appendChild(tab);
  }

  function setHeaderUser(profile) {
    const navLink = $('#nav-user-link');
    const tabLink = $('#tab-user-link');
    if (!navLink || !tabLink) return;
    if (profile) {
      const href = 'profile.html';
      const avatarImg = profile.avatar_url ? `<img class="avatar" src="${esc(profile.avatar_url)}" alt="">` : I.user;
      navLink.href = href; navLink.setAttribute('aria-label', '내 프로필'); navLink.innerHTML = avatarImg;
      tabLink.href = href;
    } else {
      navLink.href = 'login.html'; navLink.setAttribute('aria-label', '로그인'); navLink.innerHTML = I.user;
      tabLink.href = 'login.html';
    }
  }

  /* ---------- 피드 카드 ---------- */
  function cardHTML(p, { detail = false } = {}) {
    const editedBadge = p.edited ? ' <span class="edited">(수정됨)</span>' : '';
    const media = p.imageUrl
      ? `<div class="card-media" data-media>
           <img src="${esc(p.imageUrl)}" alt="${esc((p.caption || '').slice(0, 60))}" loading="lazy">
           <div class="burst" aria-hidden="true">${I.heartFill}</div></div>`
      : `<div class="card-text-only" data-media>${esc(p.caption)}${editedBadge}<div class="burst" aria-hidden="true"></div></div>`;
    const caption = p.imageUrl && p.caption
      ? `<div class="caption"><b>${esc(p.authorUsername)}</b>${esc(p.caption)}${editedBadge}</div>`
      : '';
    const cmtLink = detail
      ? ''
      : p.commentCount ? `<a class="more-cmt" href="post.html?id=${p.id}">댓글 ${p.commentCount}개 모두 보기</a>` : `<a class="more-cmt" href="post.html?id=${p.id}">댓글 달기…</a>`;
    return `<article class="card" data-id="${p.id}">
      <div class="card-head">
        <a href="profile.html?u=${encodeURIComponent(p.authorUsername)}"><img class="avatar md" src="${esc(p.authorAvatar || '')}" alt=""></a>
        <div class="who"><a class="name" href="profile.html?u=${encodeURIComponent(p.authorUsername)}">${esc(p.authorUsername)}</a><div class="time">${esc(p.timeLabel)}</div></div>
        ${p.isMine ? `<button class="icon-btn" data-menu aria-label="게시글 메뉴">${I.dots}</button>` : ''}
      </div>
      ${media}
      <div class="card-actions">
        <button class="icon-btn like-btn ${p.liked ? 'liked' : ''}" data-like aria-pressed="${p.liked}" aria-label="좋아요">${I.heart}</button>
        <a class="icon-btn" href="post.html?id=${p.id}" aria-label="댓글">${I.comment}</a>
      </div>
      <div class="card-body">
        <div class="likes" data-likes>좋아요 ${p.likeCount.toLocaleString()}개</div>
        ${caption}${cmtLink}
      </div></article>`;
  }

  /**
   * handlers:
   *   onLike(post) / onUnlike(post) -> Promise, 실패 시 throw (낙관적 업데이트 롤백)
   *   onEditHref(post) -> string (기본: edit.html?id=)
   *   onDeleteConfirmed(post) -> Promise, 성공 시 resolve
   *   onDeleted(post) -> 삭제 후 DOM 처리 (기본: 홈으로 이동)
   *   onNavigate(post) -> 미디어 클릭(싱글탭) 시 상세 이동 전 호출, false 반환 시 이동 취소
   */
  function bindCard(card, p, handlers = {}) {
    const likeBtn = $('[data-like]', card);
    const likesEl = $('[data-likes]', card);
    const burst = $('.burst', card);
    let busy = false;

    async function toggle(forceOn) {
      if (busy) return;
      if (forceOn && p.liked) return;
      const wasLiked = p.liked, prevCount = p.likeCount;
      p.liked = !p.liked;
      p.likeCount += p.liked ? 1 : -1;
      likeBtn.classList.toggle('liked', p.liked);
      likeBtn.setAttribute('aria-pressed', p.liked);
      likesEl.textContent = `좋아요 ${p.likeCount.toLocaleString()}개`;
      busy = true;
      try {
        await (p.liked ? handlers.onLike?.(p) : handlers.onUnlike?.(p));
      } catch (e) {
        // 롤백
        p.liked = wasLiked; p.likeCount = prevCount;
        likeBtn.classList.toggle('liked', p.liked);
        likeBtn.setAttribute('aria-pressed', p.liked);
        likesEl.textContent = `좋아요 ${p.likeCount.toLocaleString()}개`;
        toast('좋아요 처리에 실패했어요. 다시 시도해주세요.');
      } finally {
        busy = false;
      }
    }
    likeBtn.onclick = () => toggle();

    const media = $('[data-media]', card);
    let last = 0;
    media.addEventListener('click', () => {
      const now = Date.now();
      if (now - last < 320) {
        toggle(true);
        if (p.imageUrl) { burst.classList.remove('show'); void burst.offsetWidth; burst.classList.add('show'); }
      } else if (!card.closest('.detail')) {
        setTimeout(() => {
          if (Date.now() - last >= 320 && last === now) {
            if (handlers.onNavigate && handlers.onNavigate(p) === false) return;
            location.href = `post.html?id=${p.id}`;
          }
        }, 330);
      }
      last = now;
    });

    const menu = $('[data-menu]', card);
    if (menu) menu.onclick = () => actionSheet([
      { label: '수정', onClick: () => (location.href = handlers.onEditHref ? handlers.onEditHref(p) : `edit.html?id=${p.id}`) },
      { label: '삭제', danger: true, onClick: () => confirmModal(
        { title: '게시글을 삭제할까요?', message: '댓글과 좋아요도 함께 삭제되며 되돌릴 수 없어요.', okText: '삭제', danger: true },
        async () => {
          try {
            await handlers.onDeleteConfirmed?.(p);
            toast('게시글이 삭제되었어요');
            if (handlers.onDeleted) handlers.onDeleted(p);
            else setTimeout(() => (location.href = 'index.html'), 600);
          } catch (e) {
            toast('삭제에 실패했어요. 다시 시도해주세요.');
          }
        }) },
    ]);
  }

  window.UI = { I, $, $$, esc, qs, openOverlay, confirmModal, actionSheet, toast, renderChrome, setHeaderUser, cardHTML, bindCard };

  // 이 스크립트는 항상 본문 콘텐츠 뒤, 모듈 스크립트보다 앞에 위치합니다.
  // document.body는 이미 존재하므로 DOMContentLoaded를 기다리지 않고 즉시 그립니다 —
  // 뒤이어 실행되는 type="module" 페이지 스크립트가 안전하게 #nav-user-link 등을 찾을 수 있도록.
  if (!document.body.dataset.bare) renderChrome();
})();
