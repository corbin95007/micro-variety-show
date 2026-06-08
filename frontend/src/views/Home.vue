<template>
  <div class="home">
    <header class="home-header">
      <div class="header-grain"></div>
      <div class="header-content">
        <h1 class="show-title">{{ SITE.name }}</h1>
        <p class="show-subtitle">{{ SITE.subtitle }}</p>
      </div>
    </header>

    <div class="swipe-section">
      <van-swipe :autoplay="4000" indicator-color="var(--color-primary)" class="home-swipe">
        <van-swipe-item v-for="(img, idx) in bannerImages" :key="idx">
          <img :src="img" class="swipe-img" alt="" />
        </van-swipe-item>
      </van-swipe>
    </div>

    <div class="entry-section">
      <button type="button" class="entry-card entry-primary" @click="$router.push('/test')">
        <div class="entry-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </div>
        <div class="entry-text">
          <span class="entry-title">{{ HOME_TEXT.testEntryTitle }}</span>
          <span class="entry-desc">{{ HOME_TEXT.testEntryDesc }}</span>
        </div>
        <svg class="entry-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>

      <button type="button" class="entry-card entry-disabled" disabled>
        <div class="entry-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        </div>
        <div class="entry-text">
          <span class="entry-title">{{ HOME_TEXT.voteEntryTitle }}</span>
          <span class="entry-desc">{{ HOME_TEXT.voteEntryDesc }}</span>
        </div>
      </button>
    </div>

    <div class="official-section" aria-label="官方账号入口">
      <button
        v-for="entry in officialEntries"
        :key="entry.key"
        type="button"
        class="official-link-btn"
        :aria-disabled="!entry.url"
        @click="openOfficialLink(entry.url)"
      >
        <span class="official-link-title">{{ entry.label }}</span>
        <svg class="official-link-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { showToast } from 'vant'
import { SITE, HOME as HOME_TEXT, OFFICIAL_LINKS, TOAST } from '../constants'

const bannerImages = ['/banner1.jpg', '/banner2.jpg', '/banner3.jpg']

const officialEntries = [
  {
    key: 'xiaohongshu',
    label: HOME_TEXT.xiaohongshuOfficial,
    url: OFFICIAL_LINKS.xiaohongshu,
  },
  {
    key: 'douyin',
    label: HOME_TEXT.douyinOfficial,
    url: OFFICIAL_LINKS.douyin,
  },
]

function openOfficialLink(url) {
  const officialUrl = String(url || '').trim()
  if (!officialUrl) {
    showToast({ message: TOAST.officialLinkMissing, position: 'bottom' })
    return
  }

  window.open(officialUrl, '_blank', 'noopener,noreferrer')
}
</script>

<style scoped>
.home-header {
  position: relative;
  padding: 16px 20px;
  background: var(--color-primary);
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-grain {
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
  pointer-events: none;
}

.header-content { position: relative; z-index: 1; }

.show-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 900;
  color: #FFFFFF;
  letter-spacing: 0.06em;
}

.show-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 0.04em;
}

.swipe-section {
  padding: 16px 20px 0;
}

.home-swipe { border-radius: var(--radius-lg); overflow: hidden; }

.swipe-img {
  width: 100%;
  height: 180px;
  object-fit: cover;
  display: block;
  background: var(--color-primary-soft);
}

.entry-section { padding: 20px; }

.entry-card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-bottom: 12px;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-body);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.entry-card:active {
  transform: scale(0.98);
  box-shadow: var(--shadow-card);
}

.entry-primary .entry-icon {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.entry-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.entry-disabled .entry-icon {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  background: var(--color-divider);
  color: var(--color-ink-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.entry-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.entry-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-ink);
}

.entry-desc {
  font-size: 13px;
  color: var(--color-ink-light);
}

.entry-arrow { color: var(--color-ink-muted); }

.official-section {
  position: relative;
  left: 50%;
  width: 100vw;
  margin-left: -50vw;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  padding: 0 max(16px, env(safe-area-inset-right, 0px)) 24px max(16px, env(safe-area-inset-left, 0px));
}

.official-link-btn {
  max-width: min(220px, calc(100vw - 32px));
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding: 8px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--color-ink-light);
  font-size: 14px;
  font-family: var(--font-body);
  text-align: right;
  cursor: pointer;
  transition: color 0.15s ease, transform 0.15s ease;
}

.official-link-btn:hover {
  color: var(--color-primary);
}

.official-link-btn:active {
  transform: translateX(2px);
  color: var(--color-primary);
}

.official-link-btn:focus-visible {
  outline: 0;
  color: var(--color-primary);
  text-decoration: underline;
  text-underline-offset: 4px;
}

.official-link-title {
  min-width: 0;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.official-link-arrow {
  flex-shrink: 0;
  color: currentColor;
}
</style>
