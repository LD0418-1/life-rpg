// Shared by the server layout and the browser preferences (src/lib/prefs.ts).
export const APPEARANCE_KEY = "lrpg-appearance";

/** Runs in <head> before the page is drawn, so a light theme never flashes dark first. */
export const APPEARANCE_BOOT_SCRIPT = `try{var a=localStorage.getItem("${APPEARANCE_KEY}");if(a==="light"||a==="auto")document.documentElement.dataset.theme=a}catch(e){}`;
