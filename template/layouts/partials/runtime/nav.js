function mqTab(id, idx) {
  const el = document.getElementById(id);
  el.querySelectorAll('.mq-tab-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
  el.querySelectorAll('.mq-tab-content').forEach((c, i) => c.classList.toggle('active', i === idx));
}

function mqToggleNav(btn) {
  const nav = btn.closest('.mq-nav');
  if (!nav) return;
  const open = nav.classList.toggle('mq-nav-open');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function mqCloseNav(nav) {
  if (!nav) return;
  nav.classList.remove('mq-nav-open');
  const btn = nav.querySelector('.mq-nav-toggle');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function mqIsCompactNav(nav) {
  if (!nav) return false;
  const btn = nav.querySelector('.mq-nav-toggle');
  if (!btn) return false;
  return window.getComputedStyle(btn).display !== 'none';
}

function mqPositionSubmenus() {
  const viewportPadding = 8;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const groups = document.querySelectorAll('.mq-nav-group');
  groups.forEach(group => {
    const submenu = group.querySelector(':scope > .mq-nav-submenu');
    if (!submenu) return;

    group.classList.remove('mq-nav-group-open-left');

    const style = window.getComputedStyle(submenu);
    if (style.position !== 'absolute') return;

    const groupRect = group.getBoundingClientRect();
    const submenuWidth = Math.max(submenu.offsetWidth || 0, submenu.scrollWidth || 0);
    const openRightEdge = groupRect.left + submenuWidth;
    const openLeftEdge = groupRect.right - submenuWidth;
    const overflowsRight = openRightEdge > (viewportWidth - viewportPadding);
    const fitsWhenOpenLeft = openLeftEdge >= viewportPadding;

    if (overflowsRight && fitsWhenOpenLeft) {
      group.classList.add('mq-nav-group-open-left');
    }
  });
}
