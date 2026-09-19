(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const clone = value => JSON.parse(JSON.stringify(value));
  const state = {project:null, screenId:null, selectedId:null, mode:'design', undo:[], redo:[], dirty:false, scale:'fit', localBackend:false};
  const mockAdapter = {command(command){ toast(`Simulated command: ${command}`); }};
  const runtime = new ActiViewRuntime($('#device'), {mode:'design', adapter:mockAdapter, onSelect:selectElement, onNavigate:id => { state.screenId=id; state.selectedId=null; refreshAll(); }});

  async function boot() {
    try {
      state.localBackend = await ActiViewPlatform.initialize();
      const loaded = await ActiViewPlatform.loadProject();
      loadProject(loaded.project);
      bindUI(); buildComponentLibrary(); buildSimulationControls(); setMode('design');
      configurePlatformUI();
      window.addEventListener('resize', updateScale); setTimeout(updateScale);
      if (!state.localBackend && loaded.source === 'this browser') toast('Opened the project saved in this browser.');
    } catch (error) { document.body.innerHTML = `<pre class="fatal">Unable to load ActiView project:\n${escapeHTML(error.message)}</pre>`; }
  }

  function loadProject(project) {
    validateProject(project);
    state.project = project; state.screenId = project.startScreen || project.screens[0].id; state.selectedId = null; state.undo = []; state.redo = []; state.dirty = false;
    runtime.load(state.project); runtime.screenId = state.screenId; runtime.render(); refreshAll();
  }

  function bindUI() {
    $$('.modes button').forEach(button => button.onclick = () => setMode(button.dataset.mode));
    $('#scale').onchange = event => { state.scale = event.target.value; updateScale(); };
    $('#save').onclick = saveProject; $('#export').onclick = exportProject; $('#import').onclick = () => $('#file-input').click();
    $('#file-input').onchange = importProject; $('#undo').onclick = undo; $('#redo').onclick = redo;
    $('#add-screen').onclick = addScreen; $('#screen-menu').onclick = screenActions; $('#add-element').onclick = () => $('#component-library').toggleAttribute('hidden');
    $('#bring-front').onclick = () => reorderSelected(1); $('#send-back').onclick = () => reorderSelected(-1); $('#reset-sim').onclick = resetSimulation;
    $('#check-connection').onclick = () => deployRequest('api/deploy/check'); $('#deploy-form').onsubmit = event => { event.preventDefault(); deployRequest('api/deploy/activate'); };
    $('#online-download').onclick = exportProject;
    $('#device').addEventListener('pointerdown', beginCanvasDrag);
    $('#stage').addEventListener('pointerdown', event => { if (event.target === $('#stage') || event.target === $('#scale-shell') || event.target === $('#device')) selectElement(null); });
    $('#selection').querySelectorAll('i').forEach(handle => handle.addEventListener('pointerdown', event => beginResize(event, handle.dataset.handle)));
    document.addEventListener('keydown', keyboard);
    window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
  }

  function configurePlatformUI() {
    $('#local-deploy-controls').hidden = !state.localBackend;
    $('#online-deploy-notice').hidden = state.localBackend;
    $('#save').title = state.localBackend ? 'Save to the local project file' : 'Save in this browser';
    $('#export').textContent = state.localBackend ? 'Export Project' : 'Download Project';
  }

  function setMode(mode) {
    state.mode = mode; runtime.options.mode = mode;
    $$('.modes button').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
    const workspace = $('.workspace'); workspace.className = `workspace mode-${mode}`;
    $('#design-inspector').hidden = mode !== 'design'; $('#simulation-controls').hidden = mode !== 'simulate'; $('#deploy-panel').hidden = mode !== 'deploy'; $('#simulation-badge').hidden = mode === 'design';
    if (mode !== 'design') $('#selection').hidden = true;
    runtime.render(); refreshAll(); setTimeout(updateScale);
  }

  function currentScreen() { return state.project.screens.find(screen => screen.id === state.screenId) || state.project.screens[0]; }
  function selected() { return currentScreen()?.elements.find(element => element.id === state.selectedId); }

  function refreshAll() { renderScreens(); renderLayers(); renderInspector(); refreshChrome(); updateSelection(); updateHistoryButtons(); updateSavedState(); }
  function refreshChrome() {
    const screen = currentScreen(); if (!screen) return;
    $('#screen-name').textContent = screen.name; $('#viewport-label').textContent = `${state.project.display.width} × ${state.project.display.height}`;
    renderScreens(); renderLayers(); updateSelection();
  }
  function renderScreens() {
    const root = $('#screens'); root.replaceChildren();
    for (const screen of state.project.screens) {
      const button = document.createElement('button'); button.className = `screen-row${screen.id === state.screenId ? ' active' : ''}`; button.innerHTML = `<span>${escapeHTML(screen.name)}</span><small>${screen.elements.length}</small>`;
      button.onclick = () => { state.screenId = screen.id; state.selectedId = null; runtime.screenId = screen.id; runtime.render(); refreshChrome(); renderInspector(); };
      root.append(button);
    }
  }
  function renderLayers() {
    const root = $('#layers'); root.replaceChildren(); const screen = currentScreen(); if (!screen) return;
    [...screen.elements].reverse().forEach(element => {
      const button = document.createElement('button'); button.className = `layer-row${element.id === state.selectedId ? ' active' : ''}${element.visible === false ? ' hidden-layer' : ''}`;
      button.innerHTML = `<b class="layer-type">${escapeHTML(element.type.slice(0,3))}</b><span>${escapeHTML(element.id)}</span><small>${element.visible === false ? 'hidden' : ''}</small>`;
      button.onclick = () => selectElement(element.id); root.append(button);
    });
  }
  function selectElement(id) { state.selectedId = id; renderLayers(); renderInspector(); updateSelection(); }

  function renderInspector() {
    const element = selected(); $('#empty-inspector').hidden = !!element; $('#properties').hidden = !element;
    if (!element) { $('#properties').replaceChildren(); $('#selection-status').textContent = 'No selection'; return; }
    $('#selection-status').textContent = `${element.id} · ${element.type} · ${element.x}, ${element.y} · ${element.w} × ${element.h}`;
    const form = $('#properties'); form.innerHTML = `
      ${field('ID','id',element.id,'text',false)}
      <div class="field-section">Geometry</div><div class="field-grid">${field('X','x',element.x,'number')}${field('Y','y',element.y,'number')}${field('Width','w',element.w,'number')}${field('Height','h',element.h,'number')}</div>
      <div class="field-section">Content & appearance</div>
      ${['text','button','nav'].includes(element.type) ? field('Text','text',element.text || '') : ''}
      ${['status'].includes(element.type) ? field('Label','label',element.label || '') + field('Value / binding','value',element.value || '') + field('Suffix','suffix',element.suffix || '') : ''}
      ${['icon','button','nav','status'].includes(element.type) ? selectField('Icon','icon',element.icon || '', ['','home','map','music','speed','weather','phone','settings','gps','wifi','bluetooth','battery','brightness','restart','power']) : ''}
      ${element.type === 'image' ? field('Image path','src',element.src || '') : ''}
      <div class="field-grid">${colorField('Text / icon','color',element.color || '#111111')}${colorField('Background','background',normalizeColor(element.background || '#00000000'))}${field('Radius','radius',element.radius || 0,'number')}${field('Padding','padding',element.padding || 0,'number')}</div>
      <div class="field-grid">${field('Font size','fontSize',element.fontSize || 12,'number')}${selectField('Weight','fontWeight',String(element.fontWeight || 400),['400','500','600','700','800'])}${field('Line height','lineHeight',element.lineHeight || 0,'number')}${selectField('Alignment','align',element.align || 'left',['left','center','right'])}</div>
      <label class="check-row"><input type="checkbox" name="visible" ${element.visible === false ? '' : 'checked'}> Visible</label>
      <div class="field-section">Interaction</div>${selectField('Action','actionType',element.action?.type || '', ['','navigate','back','togglePlayback','command'])}${element.action?.type === 'navigate' ? selectField('Target screen','actionTarget',element.action.screen || '', state.project.screens.map(s=>s.id)) : ''}${element.action?.type === 'command' ? field('Command','actionCommand',element.action.command || '') : ''}
      <div class="inspector-actions"><button type="button" id="duplicate-element">Duplicate</button><button type="button" id="delete-element" class="danger">Delete</button></div>`;
    form.querySelectorAll('input,select,textarea').forEach(input => input.addEventListener('change', inspectorChange));
    $('#duplicate-element').onclick = duplicateElement; $('#delete-element').onclick = deleteElement;
  }

  function inspectorChange(event) {
    const element = selected(); if (!element) return; checkpoint(); const input = event.target; const key = input.name;
    if (key === 'visible') element.visible = input.checked;
    else if (['x','y','w','h','radius','padding','fontSize','lineHeight'].includes(key)) element[key] = Math.max(key === 'w' || key === 'h' ? 1 : 0, Number(input.value) || 0);
    else if (key === 'fontWeight') element[key] = Number(input.value);
    else if (key === 'actionType') { element.action = input.value ? {type:input.value} : undefined; if (input.value === 'navigate') element.action.screen = 'home'; if (input.value === 'command') element.action.command = 'custom.command'; }
    else if (key === 'actionTarget') element.action.screen = input.value;
    else if (key === 'actionCommand') element.action.command = input.value;
    else element[key] = input.value;
    changed();
  }

  function updateSelection() {
    const box = $('#selection'), element = selected(); if (!element || state.mode !== 'design' || element.visible === false) { box.hidden = true; return; }
    box.hidden = false; Object.assign(box.style,{left:`${element.x}px`,top:`${element.y}px`,width:`${element.w}px`,height:`${element.h}px`});
  }

  function beginCanvasDrag(event) {
    if (state.mode !== 'design') return; const target = event.target.closest('[data-element-id]'); if (!target) return;
    const id = target.dataset.elementId; selectElement(id); const element = selected(); if (!element) return;
    event.preventDefault(); const start = devicePoint(event); const origin = {x:element.x,y:element.y}; let moved = false;
    const move = e => { const point=devicePoint(e); if(!moved){checkpoint();moved=true;} element.x=clamp(Math.round(origin.x+point.x-start.x),0,state.project.display.width-element.w); element.y=clamp(Math.round(origin.y+point.y-start.y),0,state.project.display.height-element.h); runtime.render(); updateSelection(); renderInspector(); };
    const end = () => { window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',end); if(moved) changed(false); };
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',end,{once:true});
  }

  function beginResize(event, handle) {
    const element=selected(); if(!element) return; event.preventDefault(); event.stopPropagation(); const start=devicePoint(event); const origin={x:element.x,y:element.y,w:element.w,h:element.h}; checkpoint();
    const move=e=>{const p=devicePoint(e),dx=Math.round(p.x-start.x),dy=Math.round(p.y-start.y); if(handle.includes('e')) element.w=Math.max(8,origin.w+dx); if(handle.includes('s')) element.h=Math.max(8,origin.h+dy); if(handle.includes('w')){element.x=clamp(origin.x+dx,0,origin.x+origin.w-8);element.w=origin.w+(origin.x-element.x);} if(handle.includes('n')){element.y=clamp(origin.y+dy,0,origin.y+origin.h-8);element.h=origin.h+(origin.y-element.y);} element.w=Math.min(element.w,state.project.display.width-element.x);element.h=Math.min(element.h,state.project.display.height-element.y);runtime.render();updateSelection();renderInspector();};
    const end=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);changed(false);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',end,{once:true});
  }

  function keyboard(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='s') { event.preventDefault(); saveProject(); return; }
    if (event.target.matches('input,textarea,select')) return; const element=selected(); if(!element || state.mode!=='design') return;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); checkpoint(); const step=event.shiftKey?10:1; if(event.key==='ArrowLeft')element.x-=step;if(event.key==='ArrowRight')element.x+=step;if(event.key==='ArrowUp')element.y-=step;if(event.key==='ArrowDown')element.y+=step;element.x=clamp(element.x,0,state.project.display.width-element.w);element.y=clamp(element.y,0,state.project.display.height-element.h);changed(); }
    if (event.key==='Delete' || event.key==='Backspace') { event.preventDefault(); deleteElement(); }
    if ((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='d'){event.preventDefault();duplicateElement();}
  }

  function buildComponentLibrary() {
    const types=['text','button','card','icon','image','status','nav','map','media','battery']; const root=$('#component-library');
    types.forEach(type=>{const button=document.createElement('button');button.textContent=type[0].toUpperCase()+type.slice(1);button.onclick=()=>addElement(type);root.append(button);});
  }
  function addElement(type) {
    checkpoint(); const count=currentScreen().elements.length+1; const base={id:`${type}-${count}`,type,x:40,y:40,w:120,h:50,visible:true,z:count};
    Object.assign(base, defaultsFor(type)); currentScreen().elements.push(base); state.selectedId=base.id; $('#component-library').hidden=true; changed();
  }
  function defaultsFor(type) { const common={color:'#111111',background:'#f6f5f2',radius:12}; return {text:{text:'Text',fontSize:18,color:'#ffffff',background:'transparent'},button:{...common,text:'Button',action:{type:'navigate',screen:'home'}},card:{...common,w:180,h:100},icon:{icon:'home',color:'#ffffff',background:'transparent',w:44,h:44},image:{placeholder:'Image',background:'#333333',color:'#ffffff',w:120,h:90},status:{...common,label:'Status',value:'Value',icon:'battery',w:180,h:70},nav:{text:'',icon:'home',color:'#ffffff',background:'#111111',radius:12,w:44,h:40,action:{type:'navigate',screen:'home'}},map:{w:240,h:180},media:{...common,w:246,h:72},battery:{value:'{{device.battery_percent|100}}',color:'#ffffff',background:'transparent',w:70,h:24}}[type] || {}; }

  function duplicateElement(){const element=selected();if(!element)return;checkpoint();const copy=clone(element);copy.id=uniqueId(`${element.id}-copy`);copy.x=clamp(copy.x+8,0,state.project.display.width-copy.w);copy.y=clamp(copy.y+8,0,state.project.display.height-copy.h);currentScreen().elements.push(copy);state.selectedId=copy.id;changed();}
  function deleteElement(){const element=selected();if(!element)return;checkpoint();currentScreen().elements=currentScreen().elements.filter(item=>item.id!==element.id);state.selectedId=null;changed();}
  function reorderSelected(direction){const items=currentScreen().elements,index=items.findIndex(e=>e.id===state.selectedId),next=clamp(index+direction,0,items.length-1);if(index<0||index===next)return;checkpoint();[items[index],items[next]]=[items[next],items[index]];items.forEach((item,i)=>item.z=i);changed();}
  function addScreen(){const name=prompt('Screen name','New screen');if(!name)return;checkpoint();const id=uniqueScreenId(slug(name)||'screen');state.project.screens.push({id,name,background:'#000000',elements:[]});state.screenId=id;state.selectedId=null;runtime.screenId=id;changed();}
  function screenActions(){const screen=currentScreen();if(!screen)return;const action=prompt('Type “duplicate”, “rename”, or “remove”.','duplicate');if(action==='duplicate'){checkpoint();const copy=clone(screen);copy.id=uniqueScreenId(`${screen.id}-copy`);copy.name=`${screen.name} Copy`;copy.elements.forEach(e=>e.id=uniqueId(e.id,copy));state.project.screens.push(copy);state.screenId=copy.id;runtime.screenId=copy.id;state.selectedId=null;changed();}else if(action==='rename'){const name=prompt('Screen name',screen.name);if(name){checkpoint();screen.name=name;changed();}}else if(action==='remove'){if(state.project.screens.length===1)return toast('A project needs at least one screen.');if(confirm(`Remove “${screen.name}”?`)){checkpoint();state.project.screens=state.project.screens.filter(s=>s!==screen);state.screenId=state.project.screens[0].id;runtime.screenId=state.screenId;state.selectedId=null;changed();}}}

  function checkpoint(){state.undo.push(JSON.stringify(state.project));if(state.undo.length>80)state.undo.shift();state.redo=[];updateHistoryButtons();}
  function undo(){if(!state.undo.length)return;state.redo.push(JSON.stringify(state.project));state.project=JSON.parse(state.undo.pop());repairAfterHistory();}
  function redo(){if(!state.redo.length)return;state.undo.push(JSON.stringify(state.project));state.project=JSON.parse(state.redo.pop());repairAfterHistory();}
  function repairAfterHistory(){if(!state.project.screens.some(s=>s.id===state.screenId))state.screenId=state.project.screens[0].id;if(!selected())state.selectedId=null;runtime.screenId=state.screenId;runtime.setProject(state.project);state.dirty=true;refreshAll();}
  function changed(full=true){state.dirty=true;runtime.screenId=state.screenId;runtime.setProject(state.project);if(full)refreshAll();else{renderLayers();updateSelection();updateHistoryButtons();updateSavedState();}}
  function updateHistoryButtons(){$('#undo').disabled=!state.undo.length;$('#redo').disabled=!state.redo.length;}
  function updateSavedState(){$('#save-state').textContent=state.dirty?'Edited':(state.localBackend?'Saved':'Saved locally');}

  function buildSimulationControls(){const fields=[['Device battery','device.battery_percent','range',0,100],['Phone battery','phone.battery_percent','range',0,100],['Phone connection','phone.connection','select',['Connected','Disconnected','Pairing']],['Latitude','gps.lat','number'],['Longitude','gps.lon','number'],['GPS status','gps.status','text'],['Speed km/h','speedKmh','number'],['Temperature °','weather.temperature','number'],['Weather','weather.description','text'],['Track','music.track','text'],['Artist','music.artist','text'],['Playing','music.playing','checkbox'],['Incoming call','call.incoming','checkbox'],['Caller','call.name','text'],['Phone number','call.number','text']];const form=$('#sim-form');fields.forEach(spec=>{const [label,path,type,a,b]=spec;const wrap=document.createElement('label');wrap.textContent=label;let input;if(type==='select'){input=document.createElement('select');a.forEach(v=>input.add(new Option(v,v)));}else{input=document.createElement('input');input.type=type;if(type==='range'){input.min=a;input.max=b;}}input.name=path;setInput(input,getNested(runtime.state,path));input.addEventListener('input',()=>{setNested(runtime.state,path,readInput(input));runtime.render();});wrap.append(input);form.append(wrap);});}
  function resetSimulation(){runtime.state=ActiViewRuntime.defaultState();$$('#sim-form [name]').forEach(input=>setInput(input,getNested(runtime.state,input.name)));runtime.render();}

  async function saveProject(){try{validateProject(state.project);const message=await ActiViewPlatform.saveProject(state.project);state.dirty=false;updateSavedState();toast(message);}catch(error){toast(`Save failed: ${error.message}`,true);}}
  async function exportProject(){try{validateProject(state.project);const blob=await ActiViewPlatform.exportProject(state.project);downloadBlob(blob,`${slug(state.project.name)}.avproject.zip`);toast('Complete editable project downloaded.');}catch(error){toast(`Export failed: ${error.message}`,true);}}
  async function importProject(event){const file=event.target.files[0];if(!file)return;try{const project=await ActiViewPlatform.importProject(file);loadProject(project);state.dirty=true;updateSavedState();toast('Project opened. Save it to keep it in this browser.');}catch(error){toast(`Open failed: ${error.message}`,true);}finally{event.target.value='';}}
  async function deployRequest(endpoint){if(!state.localBackend)return toast('Download the project and use local Studio for SSH deployment.',true);const form=new FormData($('#deploy-form'));const log=$('#deploy-log');if(endpoint.endsWith('activate')&&!form.has('confirm'))return toast('Confirm activation first.',true);log.textContent='Working…';try{const payload=Object.fromEntries(form.entries());payload.project=state.project;const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();log.textContent=(result.ok?'✓ ':'✕ ')+(result.message||'')+(result.details?`\n${result.details}`:'');if(!response.ok)throw new Error(result.message||'Deployment failed');toast(result.message||'Done',!result.ok);}catch(error){log.textContent=`✕ ${error.message}`;toast(error.message,true);}}

  function updateScale(){const stage=$('#stage'),shell=$('#scale-shell'),w=state.project?.display.width||480,h=state.project?.display.height||320;let scale=Number(state.scale);if(state.scale==='fit')scale=Math.min((stage.clientWidth-70)/w,(stage.clientHeight-70)/h,3);scale=Math.max(.25,scale);shell.style.transform=`scale(${scale})`;shell.style.margin=`${(h*scale-h)/2}px ${(w*scale-w)/2}px`;}
  function devicePoint(event){const rect=$('#device').getBoundingClientRect();return{x:(event.clientX-rect.left)*state.project.display.width/rect.width,y:(event.clientY-rect.top)*state.project.display.height/rect.height};}
  function field(label,name,value,type='text',editable=true){return `<label>${escapeHTML(label)}<input name="${name}" type="${type}" value="${escapeAttr(value)}" ${editable?'':'readonly'}></label>`;}
  function colorField(label,name,value){return `<label>${escapeHTML(label)}<input name="${name}" type="text" value="${escapeAttr(value)}"></label>`;}
  function selectField(label,name,value,options){return `<label>${escapeHTML(label)}<select name="${name}">${options.map(option=>`<option value="${escapeAttr(option)}" ${String(option)===String(value)?'selected':''}>${escapeHTML(option||'None')}</option>`).join('')}</select></label>`;}
  function validateProject(project){if(!project||project.format!=='actiview-project'||project.formatVersion!==1)throw new Error('Unsupported project format.');if(!project.display||!Number.isInteger(project.display.width)||!Number.isInteger(project.display.height))throw new Error('Display dimensions are missing.');if(!Array.isArray(project.screens)||!project.screens.length)throw new Error('Project has no screens.');const ids=new Set();for(const screen of project.screens){if(!screen.id||ids.has(screen.id))throw new Error(`Duplicate or missing screen ID: ${screen.id||'(blank)'}`);ids.add(screen.id);if(!Array.isArray(screen.elements))throw new Error(`Screen ${screen.id} has no element list.`);const elements=new Set();for(const item of screen.elements){if(!item.id||elements.has(item.id))throw new Error(`Duplicate or missing element ID on ${screen.id}.`);elements.add(item.id);}}}
  function uniqueId(base,screen=currentScreen()){let id=base,n=2;while(screen.elements.some(e=>e.id===id))id=`${base}-${n++}`;return id;}function uniqueScreenId(base){let id=base,n=2;while(state.project.screens.some(s=>s.id===id))id=`${base}-${n++}`;return id;}
  function slug(text){return String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}function clamp(v,min,max){return Math.min(max,Math.max(min,v));}function normalizeColor(value){if(value==='transparent')return '#00000000';return value;}
  function getNested(object,path){return path.split('.').reduce((v,k)=>v?.[k],object);}function setNested(object,path,value){const keys=path.split('.');let node=object;keys.slice(0,-1).forEach(key=>node=node[key]??={});node[keys.at(-1)]=value;}
  function readInput(input){if(input.type==='checkbox')return input.checked;if(input.type==='number'||input.type==='range')return Number(input.value);return input.value;}function setInput(input,value){if(input.type==='checkbox')input.checked=!!value;else input.value=value??'';}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  let toastTimer;function toast(message,error=false){const node=$('#toast');node.textContent=message;node.style.background=error?'#8d1717':'#222';node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),2600);}
  function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}function escapeAttr(value){return escapeHTML(value);}
  boot();
})();
