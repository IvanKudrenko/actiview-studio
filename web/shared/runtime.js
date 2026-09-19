(() => {
  'use strict';

  const ICON_FALLBACK = {home:'⌂', map:'⌖', music:'♪', speed:'↗', weather:'☀', phone:'▯', settings:'⚙', gps:'⌖', wifi:'⌁', bluetooth:'ᛒ', battery:'▰', brightness:'☀', restart:'↻', power:'⏻'};
  const clone = value => JSON.parse(JSON.stringify(value));
  const getPath = (source, path) => path.split('.').reduce((value, key) => value == null ? undefined : value[key], source);
  const binding = /\{\{\s*([\w.]+)(?:\|([^}]*))?\s*\}\}/g;

  function resolve(template, state) {
    if (template == null) return '';
    return String(template).replace(binding, (_, path, fallback = '') => {
      let value = getPath(state, path);
      if (path === 'music.playing') value = value === true || value === 'true' ? '❚❚' : '▶';
      return value === undefined || value === null || value === '' ? fallback.trim() : value;
    });
  }

  class ActiViewRuntime {
    constructor(root, options = {}) {
      this.root = root;
      this.options = options;
      this.project = null;
      this.screenId = null;
      this.history = [];
      this.state = clone(options.state || ActiViewRuntime.defaultState());
      this.selectedId = null;
    }

    static defaultState() {
      return {time:'12:00', speedKmh:18, device:{battery_percent:100}, phone:{battery_percent:82, connection:'Connected', name:'iPhone'}, gps:{lat:40.7128, lon:-74.006, status:'3D fix'}, weather:{temperature:72, description:'Clear'}, music:{track:'Midnight City', artist:'M83', playing:false}, trip:{elapsed:'00:42:16', distance_km:'12.4'}, waypointsText:'Home\n40.71280, -74.00600', contactsText:'Alex\nJamie\nMorgan', call:{incoming:false, name:'Alex', number:'(555) 010-2026'}};
    }

    load(project) {
      this.project = project;
      this.screenId = project.startScreen || project.screens[0]?.id;
      this.render();
    }

    setProject(project, preserveScreen = true) {
      const current = this.screenId;
      this.project = project;
      this.screenId = preserveScreen && project.screens.some(s => s.id === current) ? current : (project.startScreen || project.screens[0]?.id);
      this.render();
    }

    setState(patch) {
      this.state = deepMerge(this.state, patch);
      this.render();
    }

    navigate(screenId) {
      if (!this.project?.screens.some(screen => screen.id === screenId)) return;
      if (this.screenId !== screenId) this.history.push(this.screenId);
      this.screenId = screenId;
      this.selectedId = null;
      this.render();
      this.options.onNavigate?.(screenId);
    }

    render() {
      if (!this.project) return;
      const screen = this.project.screens.find(item => item.id === this.screenId) || this.project.screens[0];
      if (!screen) return;
      this.root.replaceChildren();
      this.root.className = 'av-device';
      this.root.style.width = `${this.project.display.width}px`;
      this.root.style.height = `${this.project.display.height}px`;
      this.root.style.background = screen.background || this.project.theme.background;
      this.root.style.fontFamily = this.project.theme.fontFamily;
      for (const element of screen.elements) this.root.append(this.renderElement(element));
      this.root.append(this.renderCallOverlay());
      this.options.onRendered?.(screen);
    }

    renderElement(item) {
      const interactive = ['button','nav'].includes(item.type) || item.action;
      const node = document.createElement(interactive ? 'button' : 'div');
      node.className = `av-element av-${item.type}`;
      node.dataset.elementId = item.id;
      Object.assign(node.style, {
        left:`${item.x || 0}px`, top:`${item.y || 0}px`, width:`${item.w || 1}px`, height:`${item.h || 1}px`,
        color:item.color || this.project.theme.text, background:item.background || 'transparent',
        borderRadius:`${item.radius || 0}px`, padding:`${item.padding || 0}px`,
        fontSize:`${item.fontSize || 12}px`, fontWeight:String(item.fontWeight || 400),
        lineHeight:item.lineHeight ? `${item.lineHeight}px` : 'normal',
        textAlign:item.align || 'left', justifyContent: alignment(item.align),
        display:item.visible === false ? 'none' : undefined, zIndex:String(item.z || 0)
      });
      if (item.opacity != null) node.style.opacity = item.opacity;
      if (item.borderColor) node.style.border = `${item.borderWidth || 1}px solid ${item.borderColor}`;
      this.fillElement(node, item);
      node.addEventListener('pointerdown', event => {
        if (this.options.mode === 'design') {
          event.preventDefault(); event.stopPropagation(); this.options.onSelect?.(item.id, event); return;
        }
      });
      if (interactive) node.addEventListener('click', event => {
        if (this.options.mode === 'design') { event.preventDefault(); return; }
        this.action(item.action, item, event);
      });
      return node;
    }

    fillElement(node, item) {
      if (item.type === 'text' || item.type === 'card') node.textContent = item.type === 'text' ? resolve(item.text, this.state) : '';
      else if (item.type === 'icon') node.append(this.icon(item.icon, item.color));
      else if (item.type === 'image') {
        if (item.src) { const img = document.createElement('img'); img.src = item.src; img.alt = item.alt || ''; img.style.cssText = 'width:100%;height:100%;object-fit:cover'; node.append(img); }
        else { node.textContent = item.placeholder || 'Image'; node.style.display = 'flex'; node.style.alignItems = 'center'; node.style.justifyContent = 'center'; node.style.fontSize = '42px'; }
      } else if (item.type === 'button' || item.type === 'nav') {
        if (item.icon) node.append(this.icon(item.icon, item.color));
        const label = document.createElement('span'); label.textContent = resolve(item.text, this.state); node.append(label);
      } else if (item.type === 'status') {
        if (item.icon) node.append(this.icon(item.icon, item.color));
        const label = document.createElement('span'); label.className = 'av-status-label'; label.textContent = resolve(item.label, this.state); node.append(label);
        const value = document.createElement('span'); value.className = 'av-status-value'; value.textContent = resolve(item.value, this.state) + (item.suffix || ''); node.append(value);
      } else if (item.type === 'media') {
        node.innerHTML = `<span class="av-media-note">♪</span><span class="av-media-track"></span><span class="av-media-artist"></span><span class="av-media-controls">◀◀ <b>${this.state.music?.playing ? '❚❚' : '▶'}</b> ▶▶</span>`;
        node.querySelector('.av-media-track').textContent = this.state.music?.track || 'No song';
        node.querySelector('.av-media-artist').textContent = this.state.music?.artist || '--';
      } else if (item.type === 'map') {
        const label = document.createElement('span'); label.className = 'av-map-label'; label.textContent = `${Number(this.state.gps?.lat || 0).toFixed(4)}, ${Number(this.state.gps?.lon || 0).toFixed(4)} · simulated tiles`; node.append(label);
      } else if (item.type === 'battery') {
        const raw = resolve(item.value, this.state); const pct = Math.max(0, Math.min(100, Number(raw) || 0));
        node.innerHTML = `<span class="av-battery-shell"><span class="av-battery-level" style="display:block;width:${pct}%"></span></span><span>${pct}%</span>`;
      } else node.textContent = resolve(item.text || item.type, this.state);
    }

    icon(name, color) {
      const holder = document.createElement('span'); holder.className = 'fallback-icon'; holder.style.color = color || 'currentColor';
      const img = document.createElement('img'); img.src = `assets/icons/${name}.svg`; img.alt = ''; img.draggable = false;
      img.addEventListener('error', () => { holder.textContent = ICON_FALLBACK[name] || '◆'; });
      holder.append(img); return holder;
    }

    action(action, item) {
      if (!action) return;
      if (action.type === 'navigate') this.navigate(action.screen);
      else if (action.type === 'back') this.navigate(this.history.pop() || 'home');
      else if (action.type === 'togglePlayback') {
        this.state.music.playing = !this.state.music.playing; this.render(); this.options.adapter?.command('music.toggle', this.state);
      } else if (action.type === 'command') this.options.adapter?.command(action.command, this.state);
      this.options.onAction?.(action, item);
    }

    renderCallOverlay() {
      const overlay = document.createElement('div'); overlay.className = 'av-call-overlay'; overlay.hidden = !this.state.call?.incoming;
      const kind = document.createElement('div'); kind.className = 'kind'; kind.textContent = 'Incoming Call';
      const name = document.createElement('div'); name.className = 'name'; name.textContent = this.state.call?.name || 'Unknown';
      const number = document.createElement('div'); number.className = 'number'; number.textContent = this.state.call?.number || '';
      const actions = document.createElement('div'); actions.className = 'av-call-actions';
      for (const [label, cls, command] of [['Accept','accept','phone.accept'],['Decline','decline','phone.decline']]) {
        const button = document.createElement('button'); button.className = cls; button.textContent = label; button.onclick = () => { this.state.call.incoming = false; this.options.adapter?.command(command, this.state); this.render(); }; actions.append(button);
      }
      overlay.append(kind, name, number, actions); return overlay;
    }
  }

  function alignment(value) { return value === 'center' ? 'center' : value === 'right' ? 'flex-end' : 'flex-start'; }
  function deepMerge(target, source) {
    const output = clone(target || {});
    for (const [key, value] of Object.entries(source || {})) output[key] = value && typeof value === 'object' && !Array.isArray(value) ? deepMerge(output[key] || {}, value) : value;
    return output;
  }
  window.ActiViewRuntime = ActiViewRuntime;
})();
