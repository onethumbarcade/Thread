// Both documents address the same native player. It survives WebView navigation.
// Browser builds keep their HTML audio fallback; the app never starts that audio.
globalThis.ThreadMenuMusic = {
  create(element) {
    const native = globalThis.ThreadNative?.menuMusic;
    if (!native) return element;
    element.pause();
    element.removeAttribute('src');
    return {
      volume: .42,
      play() { return native.setPlaying({ playing: true, volume: this.volume }); },
      pause() { native.setPlaying({ playing: false }).catch(() => {}); },
    };
  },
};
