export interface MenuItem {
  label: string;
  shortcut?: string;
  action: () => void;
}

let activeMenu: HTMLElement | null = null;

export function showContextMenu(items: MenuItem[], x: number, y: number) {
  hideContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'active-context-menu';
  items.forEach(item => {
    if (item.label === '---') {
      const sep = document.createElement('div');
      sep.className = 'context-menu-sep';
      menu.appendChild(sep);
      return;
    }
    const el = document.createElement('div');
    el.className = 'context-menu-item';
    el.innerHTML = `<span>${item.label}</span>${item.shortcut ? `<span class="shortcut">${item.shortcut}</span>` : ''}`;
    el.addEventListener('click', () => { hideContextMenu(); item.action(); });
    menu.appendChild(el);
  });
  document.body.appendChild(menu);
  activeMenu = menu;
  const rect = menu.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
  if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

export function hideContextMenu() {
  activeMenu?.remove();
  activeMenu = null;
}

export function initContextMenuDismiss() {
  document.addEventListener('click', hideContextMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideContextMenu(); });
  document.addEventListener('contextmenu', e => e.preventDefault());
}
