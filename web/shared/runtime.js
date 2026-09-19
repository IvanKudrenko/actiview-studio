(() => {
  'use strict';

  const ICON_FALLBACK = {home:'⌂', map:'⌖', music:'♪', speed:'↗', weather:'☀', phone:'▯', settings:'⚙', gps:'⌖', wifi:'⌁', bluetooth:'ᛒ', battery:'▰', brightness:'☀', restart:'↻', power:'⏻', apps:'▦'};
  const clone = value => JSON.parse(JSON.stringify(value));
  const getPath = (source, path) => path.split('.').reduce((value, key) => value == null ? undefined : value[key], source);
  const binding = /\{\{\s*([\w.]+)(?:\|([^}]*))?\s*\}\}/g;

  function resolve(template, state) {
    if (template == null) return '';
    return String(template).replace(binding, (_, path, fallback = '') => {
      let value = getPath(state, path);
      if (path === 'music.playing') value = value === true || value === 'true' ? 'Ⅱ' : '▶';
      return value === undefined || value === null || value === '' ? fallback.trim() : value;
    });
  }

  function isVisible(item, state) {
    if (item.visible === false) return false;
    const expression = String(item.visibleWhen || '').trim();
    if (!expression) return true;
    const negate = expression.startsWith('!');
    const body = negate ? expression.slice(1) : expression;
    const equal = body.indexOf('=');
    let result;
    if (equal >= 0) {
      const path = body.slice(0, equal).trim();
      const expected = body.slice(equal + 1).trim();
      result = String(getPath(state, path)) === expected;
    } else result = Boolean(getPath(state, body));
    return negate ? !result : result;
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
      this.callReturnScreen = null;
    }

    static defaultState() {
      return {
        time:'12:00', speedKmh:18,
        device:{battery_percent:100},
        connection:{connected:true, transport:'BLE', message:'Connected over BLE'},
        phone:{battery_percent:82, charging:false, connection:'Connected', phone_name:'iPhone', name:'iPhone'},
        gps:{lat:40.7128, lon:-74.006, speed_mps:5, heading_deg:127, altitude_m:18, status:'3D FIX'},
        map:{zoom:15, follow:true, feedback:''},
        weather:{temperature_f:72, temperature:22, summary:'Clear, 72°F', description:'Clear'},
        music:{title:'Midnight City', track:'Midnight City', artist:'M83', source:'iPhone', playing:false, volume:43},
        route:{active:false, destination:'Riverside Park', eta:'12 min', distance:'4.8 km', next_turn:'Turn right in 300 m', points:[]},
        breadcrumbs:[{lat:40.7118,lon:-74.0072},{lat:40.7122,lon:-74.0068},{lat:40.7128,lon:-74.006}],
        active_trip:null,
        trip:{status:'No active trip. Start recording when you begin moving.', max:'--', avg:'--', distance:'--', moving:'--'},
        waypointsText:'Home\n  40.71280, -74.00600', waypointMessage:'',
        contacts:[
          {name:'Alex',number:'(555) 010-2026'}, {name:'Jamie',number:'(555) 010-2214'},
          {name:'Morgan',number:'(555) 010-2480'}, {name:'Taylor',number:'(555) 010-2671'}
        ],
        dialNumber:'', phoneFeedback:'', sos:{message:''}, system:{message:'', unit:'kmh', unitLabel:'km/h'},
        airplay:{status:'AirPlay is not installed yet.\nInstall or configure UxPlay first.'},
        carplay:{status:'CarPlay is not installed yet.\nInstall or configure a CarPlay receiver first.'},
        call:{incoming:false, active:false, status:'', name:'Alex', number:'(555) 010-2026'}
      };
    }

    load(project) {
      this.project = project;
      this.screenId = project.startScreen || project.screens[0]?.id;
      this.render();
    }

    setProject(project, preserveScreen = true) {
      const current = this.screenId;
      this.project = project;
      this.screenId = preserveScreen && project.screens.some(screen => screen.id === current) ? current : (project.startScreen || project.screens[0]?.id);
      this.render();
    }

    setState(patch) {
      this.state = deepMerge(this.state, patch);
      this.syncCallScreen();
      this.render();
    }

    syncCallScreen() {
      if (!this.project?.screens.some(screen => screen.id === 'incoming-call') || this.options.mode === 'design') return;
      if (this.state.call?.incoming && this.screenId !== 'incoming-call') {
        this.callReturnScreen = this.screenId;
        this.screenId = 'incoming-call';
        this.options.onNavigate?.(this.screenId);
      } else if (!this.state.call?.incoming && this.screenId === 'incoming-call') {
        this.screenId = this.callReturnScreen || 'home';
        this.callReturnScreen = null;
        this.options.onNavigate?.(this.screenId);
      }
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
      this.root.className = `av-device av-${this.options.mode || 'simulate'}`;
      this.root.style.width = `${this.project.display.width}px`;
      this.root.style.height = `${this.project.display.height}px`;
      this.root.style.background = screen.background || this.project.theme.background;
      this.root.style.fontFamily = this.project.theme.fontFamily;
      for (const element of screen.elements) this.root.append(this.renderElement(element));
      this.options.onRendered?.(screen);
    }

    renderElement(item) {
      const interactive = ['button','nav','tile'].includes(item.type) || item.action;
      const node = document.createElement(interactive ? 'button' : 'div');
      node.className = `av-element av-${item.type}`;
      node.dataset.elementId = item.id;
      Object.assign(node.style, {
        left:`${item.x ?? 0}px`, top:`${item.y ?? 0}px`, width:`${item.w ?? 1}px`, height:`${item.h ?? 1}px`,
        color:item.color || this.project.theme.text,
        background:['tile','map'].includes(item.type) ? undefined : (item.background || 'transparent'),
        borderRadius:`${item.radius || 0}px`, padding:`${item.padding || 0}px`,
        fontSize:`${item.fontSize || 12}px`, fontWeight:String(item.fontWeight || 400),
        lineHeight:item.lineHeight ? `${item.lineHeight}px` : 'normal', textAlign:item.align || 'left',
        justifyContent:alignment(item.align), alignItems:verticalAlignment(item.verticalAlign),
        display:isVisible(item, this.state) ? undefined : 'none', zIndex:String(item.z || 0)
      });
      if (item.opacity != null) node.style.opacity = item.opacity;
      if (item.borderColor) node.style.border = `${item.borderWidth || 1}px solid ${item.borderColor}`;
      if (item.shape === 'superellipse' || item.type === 'shape') node.style.clipPath = superellipseClip(item.exponent || 4.6);
      this.fillElement(node, item);
      node.addEventListener('pointerdown', event => {
        if (this.options.mode === 'design') {
          event.preventDefault(); event.stopPropagation(); this.options.onSelect?.(item.id, event);
        }
      });
      if (interactive) node.addEventListener('click', event => {
        if (this.options.mode === 'design') { event.preventDefault(); return; }
        this.action(item.action, item, event);
      });
      return node;
    }

    fillElement(node, item) {
      if (item.type === 'text') node.textContent = resolve(item.text, this.state);
      else if (item.type === 'card' || item.type === 'shape') node.textContent = item.text ? resolve(item.text, this.state) : '';
      else if (item.type === 'icon') node.append(this.icon(item.icon, item.color, item.iconSrc));
      else if (item.type === 'image') {
        if (item.src) {
          const img = document.createElement('img'); img.src = item.src; img.alt = item.alt || ''; img.draggable = false;
          img.style.cssText = `width:100%;height:100%;object-fit:${item.objectFit || 'contain'}`; node.append(img);
        } else { node.textContent = item.placeholder || 'Image'; node.style.display = 'flex'; node.style.alignItems = 'center'; node.style.justifyContent = 'center'; node.style.fontSize = '42px'; }
      } else if (item.type === 'button' || item.type === 'nav') {
        if (item.icon || item.iconSrc) {
          const icon = this.icon(item.icon, item.color, item.iconSrc); icon.style.width = `${item.iconSize || 24}px`; icon.style.height = `${item.iconSize || 24}px`; node.append(icon);
        }
        const label = document.createElement('span'); label.textContent = resolve(item.text, this.state); node.append(label);
      } else if (item.type === 'tile') this.fillTile(node, item);
      else if (item.type === 'status') {
        if (item.icon || item.iconSrc) node.append(this.icon(item.icon, item.color, item.iconSrc));
        const label = document.createElement('span'); label.className = 'av-status-label'; label.textContent = resolve(item.label, this.state); node.append(label);
        const value = document.createElement('span'); value.className = 'av-status-value'; value.textContent = resolve(item.value, this.state) + (item.suffix || ''); node.append(value);
      } else if (item.type === 'media') this.fillMedia(node, item);
      else if (item.type === 'map') this.fillMap(node, item);
      else if (item.type === 'battery') {
        const raw = resolve(item.value, this.state); const pct = Math.max(0, Math.min(100, Number(raw) || 0));
        node.innerHTML = `<span class="av-battery-shell"><span class="av-battery-level" style="display:block;width:${pct}%"></span></span><span>${pct}%</span>`;
      } else node.textContent = resolve(item.text || item.type, this.state);
    }

    fillTile(node, item) {
      node.style.background = 'transparent';
      const face = document.createElement('span'); face.className = 'av-tile-face';
      const faceSize = Number(item.faceSize || Math.min(item.w || 64, item.h || 64));
      Object.assign(face.style, {width:`${item.faceWidth || faceSize}px`,height:`${item.faceHeight || faceSize}px`,background:item.background || '#667075',clipPath:superellipseClip(item.exponent || 4.6)});
      if (item.icon === 'apps') face.append(this.gridIcon(item.color || '#fff'));
      else if (item.icon || item.iconSrc) {
        const icon = this.icon(item.icon, item.color, item.iconSrc); icon.style.width = `${item.iconSize || 44}px`; icon.style.height = `${item.iconSize || 44}px`; face.append(icon);
      }
      if (item.value) { const value=document.createElement('strong'); value.className='av-tile-value'; value.textContent=resolve(item.value,this.state); face.append(value); }
      if (item.detail) { const detail=document.createElement('small'); detail.className='av-tile-detail'; detail.textContent=resolve(item.detail,this.state); face.append(detail); }
      const label = document.createElement('span'); label.className = 'av-tile-label'; label.textContent = resolve(item.text, this.state);
      node.append(face, label);
    }

    fillMedia(node, item) {
      node.innerHTML = '<span class="av-media-note">♪</span><span class="av-media-track"></span><span class="av-media-artist"></span><span class="av-media-controls"></span>';
      node.querySelector('.av-media-track').textContent = this.state.music?.title || this.state.music?.track || 'No song';
      node.querySelector('.av-media-artist').textContent = this.state.music?.artist || '--';
      const controls = node.querySelector('.av-media-controls');
      for (const [label, command, className] of [['◀◀','music.prev','previous'],[this.state.music?.playing ? 'Ⅱ' : '▶','music.toggle','play'],['▶▶','music.next','next']]) {
        const control = document.createElement('button'); control.type = 'button'; control.className = className; control.textContent = label;
        control.addEventListener('click', event => { event.stopPropagation(); if (this.options.mode !== 'design') this.action(command === 'music.toggle' ? {type:'togglePlayback'} : {type:'command',command}, item, event); });
        controls.append(control);
      }
    }

    fillMap(node, item) {
      node.classList.add('av-map-fallback');
      const lat = Number(this.state.gps?.lat), lon = Number(this.state.gps?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        const waiting=document.createElement('span'); waiting.className='av-map-waiting'; waiting.textContent='Waiting for GPS'; node.append(waiting); return;
      }
      const zoom=Math.max(1,Math.min(19,Number(this.state.map?.zoom ?? item.zoom ?? 15)));
      const width=Number(item.w||1), height=Number(item.h||1), center=latLonToPixel(lat,lon,zoom);
      const minX=Math.floor((center.x-width/2)/256), maxX=Math.floor((center.x+width/2)/256), minY=Math.floor((center.y-height/2)/256), maxY=Math.floor((center.y+height/2)/256), limit=2**zoom;
      const tileSource=item.tileSource||'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png';
      for(let tx=minX;tx<=maxX;tx++)for(let ty=minY;ty<=maxY;ty++){
        if(ty<0||ty>=limit)continue;const x=((tx%limit)+limit)%limit,image=document.createElement('img');image.className='av-map-tile';image.alt='';image.draggable=false;image.referrerPolicy='no-referrer';
        image.src=tileSource.replace('{z}',zoom).replace('{x}',x).replace('{y}',ty);image.style.left=`${tx*256-center.x+width/2}px`;image.style.top=`${ty*256-center.y+height/2}px`;
        image.addEventListener('load',()=>node.classList.remove('av-map-fallback'));image.addEventListener('error',()=>image.remove());node.append(image);
      }
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('av-map-overlay');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
      this.mapPath(svg,this.state.breadcrumbs||[],'#00C2FF',3,center,zoom,width,height);const route=this.state.route||this.state.active_route||{};if(route.active!==false)this.mapPath(svg,route.points||[],'#FFB000',4,center,zoom,width,height);
      const marker=document.createElementNS('http://www.w3.org/2000/svg','circle');marker.setAttribute('cx',width/2);marker.setAttribute('cy',height/2);marker.setAttribute('r','7');marker.setAttribute('fill','#7CFF6B');marker.setAttribute('stroke','#061a10');marker.setAttribute('stroke-width','2');svg.append(marker);node.append(svg);
      if(item.showCoordinates!==false){const label=document.createElement('span');label.className='av-map-label';label.textContent=`${lat.toFixed(5)}, ${lon.toFixed(5)}`;node.append(label);}
      if(item.attribution!==false){const attr=document.createElement('span');attr.className='av-map-attribution';attr.textContent='© OpenStreetMap';node.append(attr);}
      node.addEventListener('wheel',event=>{if(this.options.mode==='design')return;event.preventDefault();this.state.map.zoom=Math.max(1,Math.min(19,zoom+(event.deltaY<0?1:-1)));this.render();},{passive:false});
    }

    mapPath(svg, points, color, widthValue, center, zoom, width, height) {
      const coords=[];for(const point of points||[]){const lat=Number(point?.lat??point?.[0]),lon=Number(point?.lon??point?.[1]);if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;const pixel=latLonToPixel(lat,lon,zoom);coords.push(`${pixel.x-center.x+width/2},${pixel.y-center.y+height/2}`);}
      if(coords.length<2)return;const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('points',coords.join(' '));line.setAttribute('fill','none');line.setAttribute('stroke',color);line.setAttribute('stroke-width',String(widthValue));line.setAttribute('stroke-linecap','round');line.setAttribute('stroke-linejoin','round');svg.append(line);
    }

    icon(name, color, source) {
      const holder=document.createElement('span');holder.className='fallback-icon';holder.style.color=color||'currentColor';
      if(name==='apps'&&!source){holder.append(this.gridIcon(color||'currentColor'));return holder;}
      const img=document.createElement('img');img.src=source||`assets/icons/${name}.svg`;img.alt='';img.draggable=false;img.addEventListener('error',()=>holder.replaceChildren(document.createTextNode(ICON_FALLBACK[name]||'◆')));holder.append(img);return holder;
    }

    gridIcon(color) { const grid=document.createElement('span');grid.className='av-grid-icon';grid.style.color=color;for(let i=0;i<9;i++)grid.append(document.createElement('i'));return grid; }

    action(action, item) {
      if (!action) return;
      if (action.type === 'navigate') this.navigate(action.screen);
      else if (action.type === 'back') this.navigate(this.history.pop() || 'home');
      else if (action.type === 'togglePlayback') {
        this.state.music.playing=!this.state.music.playing;this.render();this.options.adapter?.command('music.toggle',this.state,this);
      } else if (action.type === 'command') {
        if(['phone.accept','phone.decline'].includes(action.command)){this.state.call.incoming=false;this.state.call.active=action.command==='phone.accept';this.state.call.status=action.command==='phone.accept'?'Connected':'Call declined';this.syncCallScreen();}
        this.options.adapter?.command(action.command,this.state,this);
        if(action.screen)this.navigate(action.screen);
      }
      this.options.onAction?.(action,item);
    }
  }

  function alignment(value){return value==='center'?'center':value==='right'?'flex-end':'flex-start';}
  function verticalAlignment(value){return value==='top'?'flex-start':value==='bottom'?'flex-end':'center';}
  function deepMerge(target,source){const output=clone(target||{});for(const[key,value]of Object.entries(source||{}))output[key]=value&&typeof value==='object'&&!Array.isArray(value)?deepMerge(output[key]||{},value):value;return output;}
  function superellipseClip(exponent=4.6){const points=[],power=2/Number(exponent||4.6);for(let index=0;index<48;index++){const angle=2*Math.PI*index/48,x=50+50*Math.sign(Math.cos(angle))*Math.abs(Math.cos(angle))**power,y=50+50*Math.sign(Math.sin(angle))*Math.abs(Math.sin(angle))**power;points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);}return `polygon(${points.join(',')})`;}
  function latLonToPixel(lat,lon,zoom){const sin=Math.sin(Math.max(-85.05112878,Math.min(85.05112878,lat))*Math.PI/180),world=256*(2**zoom);return{x:(lon+180)/360*world,y:(0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*world};}
  window.ActiViewRuntime=ActiViewRuntime;
})();
