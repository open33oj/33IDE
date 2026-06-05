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
  
  // 修正缩放后的坐标
  const zoom = parseFloat(document.body.style.zoom || '1');
  const fixedX = x / zoom;
  const fixedY = y / zoom;
  
  const rect = menu.getBoundingClientRect();
  const maxX = window.innerWidth / zoom - rect.width;
  const maxY = window.innerHeight / zoom - rect.height;
  menu.style.left = Math.min(fixedX, maxX) + 'px';
  menu.style.top = Math.min(fixedY, maxY) + 'px';
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
