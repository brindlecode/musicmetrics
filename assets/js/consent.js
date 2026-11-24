/* Consent banner and "Cookie settings" dialog. State lives in window.MMConsent
 * (layouts/partials/consent/head.html). Nothing here loads third-party code. */
(function () {
  'use strict';
  var C = window.MMConsent;
  if (!C) return;
  function $(id) { return document.getElementById(id); }
  function init() {
    var bar = $('mm-consent'), dlg = $('consent-dialog');
    if (!bar || !dlg) return;
    if (!C.get()) bar.hidden = false;
    function openDialog() {
      var c = C.get();
      dlg.querySelector('[name=analytics]').checked = c ? !!c.analytics : C.analyticsAllowed();
      dlg.querySelector('[name=ads]').checked = c ? !!c.ads : C.adsAllowed();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    }
    function choose(ads, analytics) {
      C.set(ads, analytics);
      bar.hidden = true;
      if (dlg.open) dlg.close();
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-consent]');
      if (!b) return;
      var a = b.getAttribute('data-consent');
      if (a === 'accept') choose(true, true);
      else if (a === 'reject') choose(false, false);
      else if (a === 'manage' || a === 'open') { e.preventDefault(); openDialog(); }
      else if (a === 'save') choose(dlg.querySelector('[name=ads]').checked, dlg.querySelector('[name=analytics]').checked);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
