import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';
import { createStorage } from './storage.mjs';
import { localTrackUrl, sharedTrackUrl } from './links.mjs';

const API = 'https://thread-leaderboard.doug-michael-bond.chatgpt.site/api/leaderboard';
function notice(message) {
  let element = document.getElementById('native-status');
  if (!element) {
    element = document.createElement('p'); element.id = 'native-status';
    element.setAttribute('role', 'alert'); document.body.append(element);
  }
  element.textContent = message;
}

async function boot() {
  if (!Capacitor.isNativePlatform()) throw new Error('Native app required');
  const storage = await createStorage(Preferences);
  globalThis.ThreadStorage = storage;
  let isActive = true;
  async function navigate(value, replace = false) {
    const url = new URL(value, location.href), base = new URL(location.href);
    if (url.protocol !== base.protocol || url.host !== base.host) return;
    try {
      await storage.flush();
      replace ? location.replace(url.href) : location.assign(url.href);
    } catch { notice('Couldn’t save your progress. Please try again.'); }
  }
  globalThis.ThreadNative = {
    isNative: true,
    menuMusic: registerPlugin('ThreadMenuMusic'),
    ready: false,
    navigate,
    shareUrl: sharedTrackUrl,
    async back() {
      try { await storage.flush(); history.back(); }
      catch { notice('Couldn’t save your progress. Please try again.'); }
    },
    async share(data) {
      try {
        await storage.flush();
        await Share.share({ title: data.title, text: `${data.text}\n\n${data.url}`, dialogTitle: 'Share THREAD' });
        return 'shared';
      } catch (error) {
        return /cancel|dismiss/i.test(error.message || '') ? 'cancelled' : 'manual';
      }
    },
    haptic() { Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); },
    async request(url, options) {
      if (url !== API && !url.startsWith(API + '?')) throw new Error('Unsupported API');
      await storage.flush();
      const response = await CapacitorHttp.request({ url, method: options.method,
        headers: options.headers, data: options.body ? JSON.parse(options.body) : undefined,
        connectTimeout: 5000, readTimeout: 5000, responseType: 'json' });
      return { ok: response.status >= 200 && response.status < 300, status: response.status,
        json: async () => typeof response.data === 'string' ? JSON.parse(response.data) : response.data };
    },
  };
  await App.addListener('appStateChange', ({ isActive: active }) => {
    isActive = active;
    dispatchEvent(new CustomEvent('thread:app-state', { detail: { isActive } }));
    if (!active) storage.flush().catch(() => {});
  });
  await App.addListener('backButton', async () => {
    if (globalThis.ThreadAppBack?.()) return;
    await storage.flush().catch(() => {});
    await App.minimizeApp();
  });
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href]');
    if (!anchor || event.defaultPrevented || anchor.target === '_blank') return;
    const url = new URL(anchor.href, location.href), base = new URL(location.href);
    if (url.protocol === base.protocol && url.host === base.host) {
      event.preventDefault(); void navigate(url.href);
    }
  });
  const page = document.documentElement.dataset.mobilePage;
  const response = await fetch(`assets/pages/${page}.json`);
  if (!response.ok) throw new Error('Missing page scripts');
  for (const src of await response.json()) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = src;
      script.onload = resolve; script.onerror = reject; document.body.append(script);
    });
  }
  const openLink = value => {
    const url = localTrackUrl(value, location.href, ThreadDaily.today());
    if (url) void navigate(url);
  };
  await App.addListener('appUrlOpen', ({ url }) => openLink(url));
  const launch = await App.getLaunchUrl();
  if (launch?.url && sessionStorage.getItem('thread-launch-url') !== launch.url) {
    sessionStorage.setItem('thread-launch-url', launch.url); openLink(launch.url);
  }
  isActive = (await App.getState()).isActive;
  dispatchEvent(new CustomEvent('thread:app-state', { detail: { isActive } }));
  await storage.flush();
  await SplashScreen.hide();
  globalThis.ThreadNative.ready = true;
}

boot().catch(async () => {
  await SplashScreen.hide().catch(() => {});
  document.body.replaceChildren();
  const card = document.createElement('section'); card.className = 'native-start-error';
  const title = document.createElement('h1'); title.textContent = 'THREAD';
  const text = document.createElement('p'); text.textContent = 'Couldn’t open the game. Please try again.';
  const button = document.createElement('button'); button.textContent = 'TRY AGAIN';
  button.onclick = () => location.reload(); card.append(title, text, button); document.body.append(card);
});
