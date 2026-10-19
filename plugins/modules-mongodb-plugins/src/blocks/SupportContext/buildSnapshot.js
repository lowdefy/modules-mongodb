// What a support ticket carries about the browser, read when it is sent.
const buildSnapshot = (win, recorder) => {
  let timezone = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    timezone = null;
  }
  return {
    url: win.location?.href ?? null,
    user_agent: win.navigator?.userAgent ?? null,
    viewport: { width: win.innerWidth, height: win.innerHeight },
    screen: {
      width: win.screen?.width ?? null,
      height: win.screen?.height ?? null,
      pixel_ratio: win.devicePixelRatio ?? 1,
    },
    locale: win.navigator?.language ?? null,
    timezone,
    errors: recorder ? recorder.entries() : [],
  };
};

export default buildSnapshot;
