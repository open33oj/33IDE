import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Button,
  CloseButton,
  MantineProvider,
  NativeSelect,
  Textarea as MantineTextarea,
  TextInput,
} from '@mantine/core';
import {
  closeTab,
  getTabsSnapshot,
  moveTab,
  subscribeTabs,
  switchTo,
  type Tab,
} from './lib/tabs';
import {
  getActivePathSnapshot,
  getOutputSnapshot,
  getRunButtonSnapshot,
  getStatusTextSnapshot,
  getStatusTypeSnapshot,
  getThemeModeSnapshot,
  subscribeUiState,
} from './lib/ui-store';

const TAB_DRAG_THRESHOLD = 6;

function useTabsState() {
  return useSyncExternalStore(subscribeTabs, getTabsSnapshot);
}

function useRunButtonState() {
  return useSyncExternalStore(subscribeUiState, getRunButtonSnapshot);
}

function useOutputHtml() {
  return useSyncExternalStore(subscribeUiState, getOutputSnapshot);
}

function useStatusText() {
  return useSyncExternalStore(subscribeUiState, getStatusTextSnapshot);
}

function useStatusType() {
  return useSyncExternalStore(subscribeUiState, getStatusTypeSnapshot);
}

function useActivePathText() {
  return useSyncExternalStore(subscribeUiState, getActivePathSnapshot);
}

function useThemeMode() {
  return useSyncExternalStore(subscribeUiState, getThemeModeSnapshot);
}

function LoadingOverlay() {
  return (
    <div id="loading-overlay" className="loading-overlay">
      <div className="spinner" />
      <div className="loading-text" id="loading-text" data-i18n="loading.initializing">
        Initializing...
      </div>
      <div className="progress-bar">
        <div className="progress-fill" id="progress-fill" style={{ width: '0%' }} />
      </div>
    </div>
  );
}

function MenuBar() {
  return (
    <div id="menubar">
      <div className="menu-item">
        <span data-i18n="menu.file">File</span>
        <div className="menu-dropdown">
          <div id="m-new">
            <span data-i18n="menu.file.new">New</span> <span className="shortcut">Ctrl+N</span>
          </div>
          <div id="m-open">
            <span data-i18n="menu.file.open">Open...</span> <span className="shortcut">Ctrl+O</span>
          </div>
          <div className="sep" />
          <div id="m-save">
            <span data-i18n="menu.file.save">Save</span> <span className="shortcut">Ctrl+S</span>
          </div>
          <div id="m-saveas" data-i18n="menu.file.saveAs">Save As...</div>
          <div className="sep" />
          <div id="m-reveal">
            <span data-i18n="context.reveal">Reveal in Folder</span> <span className="shortcut">Ctrl+B</span>
          </div>
          <div id="m-close-tab">
            <span data-i18n="context.close">Close</span> <span className="shortcut">Ctrl+W</span>
          </div>
        </div>
      </div>
      <div className="menu-item">
        <span data-i18n="menu.theme">Theme</span>
        <div className="menu-dropdown" id="theme-menu" />
      </div>
      <div className="menu-item">
        <span data-i18n="menu.settings">Settings</span>
        <div className="menu-dropdown">
          <div id="m-settings" data-i18n="settings.open">Open Settings</div>
        </div>
      </div>
      <div id="toolbar">
        <Button id="btn-toggle-io" type="button" title="Show or hide the input/output panel" size="xs" variant="filled">
          I/O
        </Button>
        <Button id="btn-terminal" data-i18n="toolbar.terminal" size="xs" variant="filled">
          Run in Terminal
        </Button>
        <RunButton />
      </div>
    </div>
  );
}

function RunButton() {
  const runButton = useRunButtonState();

  return (
    <Button
      id="btn-run"
      className={runButton.running ? 'danger' : 'primary'}
      data-i18n={runButton.running ? undefined : 'toolbar.run'}
      disabled={runButton.disabled}
      size="xs"
      variant="filled"
    >
      {runButton.label}
    </Button>
  );
}

function EditorTabs() {
  const { tabs, activeTabId } = useTabsState();
  const dragRef = useRef<{ tabId: string; startX: number; startY: number; started: boolean } | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ tabId: string; place: 'before' | 'after' } | null>(null);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.started && Math.hypot(dx, dy) < TAB_DRAG_THRESHOLD) return;

      drag.started = true;
      setDraggingTabId(drag.tabId);
      document.body.classList.add('tab-dragging');

      const targetEl = document.elementFromPoint(event.clientX, event.clientY)?.closest('.editor-tab') as HTMLElement | null;
      const targetId = targetEl?.dataset.tabId;
      if (!targetEl || !targetId || targetId === drag.tabId) {
        setDropIndicator(null);
        return;
      }

      const rect = targetEl.getBoundingClientRect();
      const place = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
      moveTab(drag.tabId, targetId, place);
      setDropIndicator({ tabId: targetId, place });
    };

    const finishDrag = () => {
      const drag = dragRef.current;
      if (drag?.started) suppressClickRef.current = drag.tabId;
      dragRef.current = null;
      setDraggingTabId(null);
      setDropIndicator(null);
      document.body.classList.remove('tab-dragging');
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', finishDrag);
    document.addEventListener('pointercancel', finishDrag);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', finishDrag);
      document.removeEventListener('pointercancel', finishDrag);
    };
  }, []);

  const getTabClassName = (tab: Tab) => {
    const classes = ['editor-tab'];
    if (tab.id === activeTabId) classes.push('active');
    if (tab.id === draggingTabId) classes.push('dragging');
    if (dropIndicator?.tabId === tab.id) {
      classes.push(dropIndicator.place === 'before' ? 'drag-over-before' : 'drag-over-after');
    }
    return classes.join(' ');
  };

  return (
    <div id="editor-tabs">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={getTabClassName(tab)}
          data-tab-id={tab.id}
          onClick={() => {
            if (suppressClickRef.current === tab.id) {
              suppressClickRef.current = null;
              return;
            }
            switchTo(tab);
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            if ((event.target as HTMLElement).closest('.tab-close')) return;
            suppressClickRef.current = null;
            dragRef.current = {
              tabId: tab.id,
              startX: event.clientX,
              startY: event.clientY,
              started: false,
            };
          }}
        >
          <span className="tab-label">{`${tab.name}${tab.dirty ? ' *' : ''}${tab.externalModified ? ' !' : ''}`}</span>
          <CloseButton
            className="tab-close"
            size="xs"
            variant="transparent"
            aria-label={`Close ${tab.name}`}
            onClick={(event) => {
              event.stopPropagation();
              closeTab(tab.id);
            }}
          />
        </div>
      ))}
    </div>
  );
}

function OutputPane() {
  const outputHtml = useOutputHtml();
  const outputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [outputHtml]);

  return (
    <div
      id="output-content"
      ref={outputRef}
      data-i18n={outputHtml == null ? 'output.idle' : undefined}
      dangerouslySetInnerHTML={outputHtml == null ? undefined : { __html: outputHtml }}
    >
      {outputHtml == null ? 'Click Run or press F5 to compile and run code' : undefined}
    </div>
  );
}

function Workbench() {
  return (
    <div id="main">
      <div id="editor-panel">
        <EditorTabs />
        <div id="editor" />
      </div>
      <div id="resizer" className="resizer" />
      <div id="side-panel">
        <div id="io-stack">
          <section id="io-input-section" className="io-section">
            <div className="io-section-title" data-i18n="sidebar.input">Input</div>
            <div className="io-section-body">
              <textarea
                id="input-area"
                data-i18n-placeholder="placeholder.stdin"
                placeholder="Enter stdin here..."
              />
            </div>
          </section>
          <div id="io-resizer" className="io-resizer" aria-hidden="true" />
          <section id="io-output-section" className="io-section">
            <div className="io-section-title" data-i18n="sidebar.output">Output</div>
            <div className="io-section-body">
              <OutputPane />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  const statusText = useStatusText();
  const statusType = useStatusType();
  const activePathText = useActivePathText();

  return (
    <div id="statusbar" className={statusType}>
      <span id="status-path" title={activePathText}>{activePathText}</span>
      <span id="status-text" data-i18n={statusText === 'Ready' ? 'status.ready' : undefined}>{statusText}</span>
      <span id="compiler-info" />
    </div>
  );
}

function SettingsDialog() {
  return (
    <div id="settings-overlay" className="settings-overlay hidden">
      <div className="settings-dialog">
        <div className="settings-header">
          <h2 data-i18n="settings.title">Settings</h2>
          <CloseButton id="settings-close" className="settings-close" aria-label="Close settings" />
        </div>
        <div className="settings-body">
          <div className="settings-section">
            <div className="settings-section-title" data-i18n="settings.section.build">Build and Run</div>
            <TextInput
              id="settings-compiler-path"
              className="settings-field"
              label={<span data-i18n="settings.compilerPath">Compiler Path</span>}
            />
            <MantineTextarea
              id="settings-compile-flags"
              className="settings-field"
              label={<span data-i18n="settings.compileFlags">Compile Flags</span>}
              rows={4}
            />
            <div className="settings-grid">
              <TextInput
                id="settings-time-limit"
                className="settings-field"
                label={<span data-i18n="settings.timeLimit">Time Limit (ms)</span>}
                type="number"
                min={1}
              />
              <TextInput
                id="settings-stack-size"
                className="settings-field"
                label={<span data-i18n="settings.stackSize">Stack Size</span>}
              />
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title" data-i18n="settings.section.editor">Editor</div>
            <div className="settings-grid">
              <NativeSelect
                id="settings-theme"
                className="settings-field"
                label={<span data-i18n="settings.theme">Theme</span>}
              />
              <NativeSelect
                id="settings-language"
                className="settings-field"
                label={<span data-i18n="settings.defaultLanguage">Default Language</span>}
              >
                  <option value="cpp">C++</option>
              </NativeSelect>
              <NativeSelect
                id="settings-ui-language"
                className="settings-field"
                label={<span data-i18n="settings.uiLanguage">UI Language</span>}
              >
                  <option value="zh-CN">简体中文</option>
                  <option value="en-US">English</option>
              </NativeSelect>
              <TextInput
                id="settings-font-size"
                className="settings-field"
                label={<span data-i18n="settings.fontSize">Font Size</span>}
                type="number"
                min={10}
                max={96}
              />
              <TextInput
                id="settings-zoom"
                className="settings-field"
                label={<span data-i18n="settings.zoom">Zoom (%)</span>}
                type="number"
                min={50}
                max={200}
              />
              <TextInput
                id="settings-tab-size"
                className="settings-field"
                label={<span data-i18n="settings.tabSize">Tab Size</span>}
                type="number"
                min={1}
                max={8}
              />
              <label className="settings-field settings-field-checkbox">
                <input id="settings-auto-save-existing" type="checkbox" />
                <span data-i18n="settings.autoSaveExisting">Auto-save existing files</span>
              </label>
            </div>
            <TextInput
              id="settings-font-family"
              className="settings-field"
              label={<span data-i18n="settings.fontFamily">Font Family</span>}
            />
          </div>

          <div className="settings-section">
            <div className="settings-section-title" data-i18n="settings.section.format">Format</div>
            <label className="settings-field settings-field-checkbox">
              <input id="settings-clang-braces" type="checkbox" />
              <span data-i18n="settings.bracesAllman">Put opening braces on their own line (Allman)</span>
            </label>
          </div>

          <div className="settings-section">
            <div className="settings-section-title" data-i18n="settings.section.template">Template</div>
            <MantineTextarea
              id="settings-template"
              className="settings-field"
              label={<span data-i18n="settings.defaultTemplate">Default Template</span>}
              rows={10}
            />
          </div>
        </div>
        <div className="settings-footer">
          <div className="settings-footer-actions">
            <Button id="settings-reset" type="button" data-i18n="settings.reset" variant="default">
              Reset Defaults
            </Button>
            <Button id="settings-open-run-cache" type="button" data-i18n="settings.openRunCache" variant="default">
              Open Run Cache
            </Button>
          </div>
          <div className="settings-footer-actions">
            <Button id="settings-cancel" type="button" data-i18n="settings.cancel" variant="default">
              Cancel
            </Button>
            <Button id="settings-save" className="primary" type="button" data-i18n="settings.save" variant="filled">
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ThemeShell>
      <LoadingOverlay />
      <MenuBar />
      <Workbench />
      <StatusBar />
      <SettingsDialog />
    </ThemeShell>
  );
}

function ThemeShell({ children }: { children: ReactNode }) {
  const themeMode = useThemeMode();

  return (
    <MantineProvider defaultColorScheme="dark" forceColorScheme={themeMode}>
      {children}
    </MantineProvider>
  );
}
