// Applies the saved light/dark choice before the page draws, so it doesn't flash the wrong theme.
try {
  var t = localStorage.getItem('sunco-crm-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {
  /* storage unavailable */
}
