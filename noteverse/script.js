"use strict";

const $ = id => document.getElementById(id);
const DB = "noteverse_data_v1";
const FONT_URL = "https://fonts.googleapis.com/css2?family=";
let state = {notes:[], folders:["Personal","School","Ideas"], tasks:[]};
let currentId = null, currentView = "notes";
let currentAttachmentUrls = [];
let modalAction = null, assistantText = "";
let fontCatalog = [], fontLoaded = 0;
let drawing = false, erasing = false, lastPoint = null;
let toastTimer;

function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,9)}
function toast(msg){
  $("toast").textContent=msg;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2600);
}
function save(){
  try{
    localStorage.setItem(DB,JSON.stringify(state));
    $("saveStatus").textContent="Saved locally";
    $("storageInfo").textContent=`${state.notes.length} notes · ${state.tasks.length} tasks · Stored in this browser`;
  }catch(e){toast("Storage full. Download a backup and remove large attachments.");}
}
function load(){
  try{
    const raw=localStorage.getItem(DB);
    if(raw){
      const parsed=JSON.parse(raw);
      if(Array.isArray(parsed.notes)&&Array.isArray(parsed.folders)&&Array.isArray(parsed.tasks)) state=parsed;
    }
  }catch(e){toast("Could not read saved notes.");}
  renderFolders();renderNotes();renderTasks();
}
function makeNote(){
  const n={id:uid(),title:"Untitled Note",body:"",folder:state.folders[0]||"Personal",tags:[],color:"#a78bfa",favorite:false,updated:Date.now(),attachments:[],locked:false};
  state.notes.unshift(n);save();openNote(n.id);
}
function activeNote(){return state.notes.find(n=>n.id===currentId)}
function escapeHTML(s=""){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function dateLabel(t){return new Date(t).toLocaleDateString()}
function renderFolders(){
  $("folderList").innerHTML=state.folders.map(f=>`<button class="folder-link" data-folder="${escapeHTML(f)}">▣ ${escapeHTML(f)}</button>`).join("");
  $("noteFolder").innerHTML=state.folders.map(f=>`<option>${escapeHTML(f)}</option>`).join("");
  $("folderList").querySelectorAll("[data-folder]").forEach(b=>b.onclick=()=>{currentView="folder:"+b.dataset.folder;renderNotes();show("listView");});
}
function renderNotes(){
  const query=$("search").value.trim().toLowerCase();
  let notes=state.notes.filter(n=>{
    if(currentView==="starred"&&!n.favorite)return false;
    if(currentView.startsWith("folder:")&&n.folder!==currentView.slice(7))return false;
    if(query&&!`${n.title} ${n.body} ${(n.tags||[]).join(" ")} ${n.folder}`.toLowerCase().includes(query))return false;
    return true;
  });
  const titles={notes:"All Notes",starred:"Favorites",folders:"Folders"};
  $("viewTitle").textContent=currentView.startsWith("folder:")?currentView.slice(7):(titles[currentView]||"All Notes");
  $("noteCount").textContent=`${notes.length} ${notes.length===1?"note":"notes"} · Your ideas, beautifully organized`;
  $("notesGrid").innerHTML=notes.map(n=>`
    <article class="note-card" style="--accent:${escapeHTML(n.color||"#a78bfa")}" data-id="${n.id}">
      <div class="card-meta"><span>${escapeHTML(n.folder||"Personal")}</span><span>${n.favorite?"★ ":""}${dateLabel(n.updated)}</span></div>
      <h3>${escapeHTML(n.title||"Untitled Note")}</h3>
      <p>${n.locked?"🔒 Protected note":escapeHTML((n.body||"No content yet").slice(0,180))}</p>
      <div class="card-tags">${escapeHTML((n.tags||[]).join(" · "))}${n.attachments?.length?" · 📎 "+n.attachments.length:""}</div>
    </article>`).join("");
  $("notesGrid").querySelectorAll("[data-id]").forEach(card=>card.onclick=()=>openNote(card.dataset.id));
  $("empty").classList.toggle("hidden",notes.length!==0);
  $("notesGrid").classList.toggle("hidden",notes.length===0);
}
function show(id){
  ["listView","editorView","tasksView","foldersView","drawingView","fontsView","settingsView"].forEach(s=>$(s).classList.toggle("hidden",s!==id));
  document.querySelectorAll(".nav").forEach(b=>b.classList.toggle("active",b.dataset.view===id.replace("View","")));
  if(id==="foldersView")renderFolderCards();
  if(id==="settingsView")updateStorageInfo();
}
function openNote(id){
  const n=state.notes.find(x=>x.id===id);if(!n)return;
  if(n.locked){passwordPrompt("Unlock note","Enter this note's password",async pass=>{
    try{const body=await decryptText(n.encrypted,pass);n.body=body;currentId=id;fillEditor(n);show("editorView");}
    catch(e){toast("Incorrect password or damaged note.");}
  },true);return;}
  currentId=id;fillEditor(n);show("editorView");
}
function fillEditor(n){
  $("noteTitle").value=n.title||"";
  $("noteBody").value=n.body||"";
  $("noteFolder").value=n.folder||state.folders[0];
  $("noteTags").value=(n.tags||[]).join(", ");
  $("noteColor").value=n.color||"#a78bfa";
  $("favorite").textContent=n.favorite?"★ Favorited":"☆ Favorite";
  $("lockNote").textContent=n.locked?"🔒 Protected":"🔒 Protect";
  $("fontSelect").value=n.font||"Inter";
  $("fontSize").value=String(n.fontSize||18);
  $("noteBody").style.fontFamily=n.font||"Inter";
  $("noteBody").style.fontSize=(n.fontSize||18)+"px";
  $("noteBody").classList.remove("hidden");$("preview").classList.add("hidden");
  $("editMode").classList.add("active-mode");$("previewMode").classList.remove("active-mode");
  renderAttachments(n);updateWordCount();
}
function updateNote(){
  const n=activeNote();if(!n)return;
  n.title=$("noteTitle").value.trim()||"Untitled Note";
  n.body=$("noteBody").value;
  n.folder=$("noteFolder").value;
  n.tags=$("noteTags").value.split(",").map(x=>x.trim()).filter(Boolean);
  n.color=$("noteColor").value;n.font=$("fontSelect").value;n.fontSize=+$("fontSize").value;
  n.updated=Date.now();
  $("saveStatus").textContent="Saving...";
  save();renderNotes();
}
function renderAttachments(n){
  $("attachments").innerHTML="";
  currentAttachmentUrls.forEach(URL.revokeObjectURL);currentAttachmentUrls=[];
  (n.attachments||[]).forEach((a,i)=>{
    const el=document.createElement("div");el.className="attachment";
    if(a.type?.startsWith("image/")){
      const img=document.createElement("img");
      img.src=a.data;img.alt=a.name;el.appendChild(img);
    }
    const name=document.createElement("div");name.textContent=a.name;el.appendChild(name);
    const download=document.createElement("button");download.textContent="Download";
    download.onclick=()=>downloadData(a.data,a.name);el.appendChild(download);
    const remove=document.createElement("button");remove.textContent="×";
    remove.onclick=()=>{n.attachments.splice(i,1);save();renderAttachments(n);};el.appendChild(remove);
    $("attachments").appendChild(el);
  });
}
function updateWordCount(){
  const text=$("noteBody").value.trim();
  $("wordCount").textContent=`${text?text.split(/\s+/).length:0} words · ${text.length} characters`;
}
function markdown(text){
  let safe=escapeHTML(text);
  safe=safe.replace(/```([\s\S]*?)```/g,"<pre><code>$1</code></pre>");
  safe=safe.replace(/^### (.*)$/gm,"<h3>$1</h3>").replace(/^## (.*)$/gm,"<h2>$1</h2>").replace(/^# (.*)$/gm,"<h1>$1</h1>");
  safe=safe.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>").replace(/`([^`]+)`/g,"<code>$1</code>");
  safe=safe.replace(/^- (.*)$/gm,"• $1").replace(/\n/g,"<br>");
  return safe;
}
function previewNote(){
  $("preview").innerHTML=markdown($("noteBody").value);
  $("preview").classList.remove("hidden");$("noteBody").classList.add("hidden");
  $("preview").style.fontFamily=$("fontSelect").value;$("preview").style.fontSize=$("fontSize").value+"px";
  $("previewMode").classList.add("active-mode");$("editMode").classList.remove("active-mode");
}
function editNote(){
  $("preview").classList.add("hidden");$("noteBody").classList.remove("hidden");
  $("editMode").classList.add("active-mode");$("previewMode").classList.remove("active-mode");
}
function downloadData(data,name){
  const a=document.createElement("a");a.href=data;a.download=name;a.click();
}
function downloadText(name,text,type="text/plain"){
  const url=URL.createObjectURL(new Blob([text],{type}));
  downloadData(url,name);setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function downloadCurrent(){
  const n=activeNote();if(!n)return;
  downloadText((n.title||"note").replace(/[^\w\- ]/g,"")+".md",`# ${n.title}\n\n${n.body}`);
}
function exportAll(){downloadText("noteverse-notes.json",JSON.stringify(state,null,2),"application/json")}
function updateStorageInfo(){
  $("storageInfo").textContent=`${state.notes.length} notes · ${state.tasks.length} tasks · Browser storage only`;
}

function addFolder(){
  modalPrompt("New Folder","Enter a folder name",name=>{
    name=name.trim();
    if(!name)return;
    if(state.folders.includes(name)){toast("That folder already exists.");return;}
    state.folders.push(name);save();renderFolders();renderNotes();renderFolderCards();toast("Folder created.");
  },false,"Folder name");
}
function renderFolderCards(){
  $("folderCards").innerHTML=state.folders.map(f=>{
    const count=state.notes.filter(n=>n.folder===f).length;
    return `<article class="note-card"><h3>▣ ${escapeHTML(f)}</h3><p>${count} notes</p><button data-open-folder="${escapeHTML(f)}">Open Folder</button> <button data-remove-folder="${escapeHTML(f)}" class="danger">Remove</button></article>`;
  }).join("");
  $("folderCards").querySelectorAll("[data-open-folder]").forEach(b=>b.onclick=()=>{currentView="folder:"+b.dataset.openFolder;renderNotes();show("listView");});
  $("folderCards").querySelectorAll("[data-remove-folder]").forEach(b=>b.onclick=()=>{
    const f=b.dataset.removeFolder;
    if(state.folders.length===1){toast("Keep at least one folder.");return;}
    if(!confirm(`Remove folder "${f}"? Its notes will move to the first folder.`))return;
    const target=state.folders.find(x=>x!==f);
    state.notes.forEach(n=>{if(n.folder===f)n.folder=target});
    state.folders=state.folders.filter(x=>x!==f);save();renderFolders();renderNotes();renderFolderCards();
  });
}

/* Password-protected notes use Web Crypto AES-GCM. */
const enc=new TextEncoder(),dec=new TextDecoder();
async function deriveKey(password,salt){
  const material=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:180000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
function b64(buf){return btoa(String.fromCharCode(...new Uint8Array(buf)))}
function unb64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function encryptText(text,password){
  if(!crypto.subtle)throw Error("Encryption requires HTTPS or localhost.");
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveKey(password,salt);
  const data=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,enc.encode(text));
  return {salt:b64(salt),iv:b64(iv),data:b64(data)};
}
async function decryptText(payload,password){
  if(!payload)throw Error("Missing encrypted content");
  const key=await deriveKey(password,unb64(payload.salt));
  const out=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(payload.iv)},key,unb64(payload.data));
  return dec.decode(out);
}
function passwordPrompt(title,message,callback,secret=true){
  modalAction=callback;$("modalTitle").textContent=title;$("modalText").textContent=message;
  $("modalInput").type=secret?"password":"text";$("modalInput").value="";
  $("modalInput").placeholder=secret?"Password":"Type here";
  $("modalConfirm").textContent="Continue";$("modal").classList.remove("hidden");
  setTimeout(()=>$("modalInput").focus(),50);
}
function modalPrompt(title,message,callback,secret=false,placeholder="Type here"){
  modalAction=callback;$("modalTitle").textContent=title;$("modalText").textContent=message;
  $("modalInput").type=secret?"password":"text";$("modalInput").value="";
  $("modalInput").placeholder=placeholder;$("modal").classList.remove("hidden");
}
function closeModal(){$("modal").classList.add("hidden");modalAction=null}
async function confirmModal(){
  const value=$("modalInput").value,fn=modalAction;closeModal();
  if(fn)await fn(value);
}
async function toggleLock(){
  const n=activeNote();if(!n)return;
  if(n.locked){toast("This note is already protected.");return;}
  passwordPrompt("Protect this note","Choose a password. Your current note will be encrypted.",async pass=>{
    if(pass.length<6){toast("Use at least 6 characters.");return;}
    try{
      n.encrypted=await encryptText(n.body,pass);n.body="";
      n.locked=true;n.title=$("noteTitle").value||n.title;n.updated=Date.now();
      save();renderNotes();show("listView");toast("Note encrypted and protected.");
    }catch(e){toast(e.message||"Could not encrypt this note.");}
  });
}
function unlockAndRelock(n){
  if(n.locked)return;
}

/* Local writing tools. They are not a real cloud AI model. */
function runAssistant(action){
  const source=$("noteBody").value;
  const selected=window.getSelection()?.toString();
  const text=selected&&selected.trim()?selected:source;
  if(!text.trim()){toast("Write something first.");return;}
  let result=text;
  if(action==="summarize"){
    result=text.split(/(?<=[.!?])\s+/).slice(0,3).join(" ");
  }else if(action==="expand"){
    result=text+"\n\nFurther ideas:\n- What is the main goal?\n- What details or examples would help explain it?\n- What should happen next?";
  }else if(action==="correct"){
    result=text.replace(/\bi\b/g,"I").replace(/\s+([,.!?])/g,"$1").replace(/ {2,}/g," ");
    result=result.charAt(0).toUpperCase()+result.slice(1);
  }else if(action==="improve"){
    result=text.replace(/\bvery good\b/gi,"excellent").replace(/\ba lot of\b/gi,"many").replace(/\bthings\b/gi,"details").trim();
    result=result.charAt(0).toUpperCase()+result.slice(1);
  }
  assistantText=result;$("assistantResult").textContent=result;$("applyAssistant").classList.remove("hidden");
}
function applyAssistant(){
  const area=$("noteBody");
  const start=area.selectionStart,end=area.selectionEnd;
  if(start!==end)area.setRangeText(assistantText,start,end,"end");
  else area.value=assistantText;
  updateNote();updateWordCount();$("assistantResult").textContent="Result applied.";
}

/* Attachments are stored as data URLs. Large files may exceed browser storage. */
function readFile(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);
  });
}
async function attachFiles(files){
  const n=activeNote();if(!n)return;
  for(const file of files){
    if(file.size>2*1024*1024){toast(`${file.name} is over 2 MB. Please choose a smaller file.`);continue;}
    try{n.attachments.push({name:file.name,type:file.type,data:await readFile(file)});}
    catch(e){toast("Could not read "+file.name);}
  }
  save();renderAttachments(n);
}

/* Voice typing uses the browser's speech recognition, when supported. */
function voiceTyping(){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SpeechRecognition){toast("Voice typing is not supported in this browser. Try Chrome.");return;}
  const recognition=new SpeechRecognition();recognition.lang="en-IN";recognition.interimResults=false;
  recognition.onresult=e=>{
    const text=e.results[0][0].transcript;
    const area=$("noteBody"),start=area.selectionStart;
    area.setRangeText(text+" ",start,area.selectionEnd,"end");updateNote();updateWordCount();
  };
  recognition.onerror=()=>toast("Voice recognition failed or microphone permission was denied.");
  recognition.start();toast("Listening... please speak.");
}

/* Drawing pad: pointer events work with a mouse, pen or touchscreen. */
function setupCanvas(){
  const canvas=$("canvas"),ctx=canvas.getContext("2d");
  function resize(){
    const old=document.createElement("canvas");old.width=canvas.width;old.height=canvas.height;
    old.getContext("2d").drawImage(canvas,0,0);
    const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
    canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#fff";ctx.fillRect(0,0,rect.width,rect.height);
    if(old.width&&old.height)ctx.drawImage(old,0,0,old.width,old.height,0,0,rect.width,rect.height);
    ctx.lineCap="round";ctx.lineJoin="round";
  }
  resize();window.addEventListener("resize",resize);
  function point(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  canvas.addEventListener("pointerdown",e=>{
    drawing=true;canvas.setPointerCapture(e.pointerId);lastPoint=point(e);
  });
  canvas.addEventListener("pointermove",e=>{
    if(!drawing)return;const p=point(e);
    ctx.beginPath();ctx.moveTo(lastPoint.x,lastPoint.y);ctx.lineTo(p.x,p.y);
    ctx.strokeStyle=erasing?"#ffffff":$("penColor").value;ctx.lineWidth=+$("penSize").value;
    ctx.stroke();lastPoint=p;
  });
  canvas.addEventListener("pointerup",()=>drawing=false);
  canvas.addEventListener("pointercancel",()=>drawing=false);
  $("eraser").onclick=()=>{erasing=!erasing;$("eraser").textContent=erasing?"Pen mode":"Eraser";};
  $("clearCanvas").onclick=()=>{ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);};
  $("downloadDrawing").onclick=()=>downloadData(canvas.toDataURL("image/png"),"noteverse-drawing.png");
  $("saveDrawing").onclick=()=>{
    const n=activeNote();
    if(n){n.attachments.push({name:"drawing.png",type:"image/png",data:canvas.toDataURL("image/png")});save();toast("Drawing attached to the current note.");}
    else{
      const note={id:uid(),title:"My Drawing",body:"Drawing created in NoteVerse.",folder:state.folders[0]||"Personal",tags:["drawing"],color:"#a78bfa",favorite:false,updated:Date.now(),attachments:[{name:"drawing.png",type:"image/png",data:canvas.toDataURL("image/png")}],locked:false};
      state.notes.unshift(note);save();renderNotes();toast("Drawing saved as a new note.");
    }
  };
}

/* Google Fonts catalogue: fetches the public catalogue when online.
   Font files are hosted by Google Fonts; this app does not bundle 1,000 files. */
async function loadFonts(){
  const fallback=["Inter","Roboto","Open Sans","Lato","Montserrat","Poppins","Oswald","Raleway","Nunito","Playfair Display","Merriweather","Roboto Mono","Source Code Pro","Ubuntu","Rubik","DM Sans","Outfit","Manrope","Space Grotesk","Fira Code","Bebas Neue","Dancing Script","Pacifico","Lobster","Caveat","Comfortaa","Cinzel","Archivo","Karla","Quicksand","Anton","Bitter","Inconsolata","Work Sans","Barlow","Libre Baskerville","Josefin Sans","PT Sans","Mukta","Noto Sans","Noto Serif","Arimo","Lora","Figtree","Sora","Lexend","Kanit","Exo 2","Teko","Urbanist"];
  fontCatalog=fallback.map(f=>({family:f}));
  try{
    const response=await fetch("https://fonts.google.com/metadata/fonts");
    if(!response.ok)throw Error("catalogue unavailable");
    let text=await response.text();text=text.replace(/^\)\]\}'\s*/,"");
    const data=JSON.parse(text);
    if(data.familyMetadataList?.length){
      fontCatalog=data.familyMetadataList.map(f=>({family:f.family,category:f.category})).sort((a,b)=>a.family.localeCompare(b.family));
      $("fontStatus").textContent=`${fontCatalog.length.toLocaleString()} fonts available in the Google Fonts catalogue.`;
    }
  }catch(e){
    $("fontStatus").textContent=`Showing ${fontCatalog.length} suggested fonts. Connect to the internet to load the full catalogue.`;
  }
  renderFontResults();
}
function loadFontPreview(family){
  const href=FONT_URL+encodeURIComponent(family).replace(/%20/g,"+")+":wght@400;700&display=swap";
  if(!document.querySelector(`link[data-font="${CSS.escape(family)}"]`)){
    const link=document.createElement("link");link.rel="stylesheet";link.href=href;link.dataset.font=family;document.head.appendChild(link);
  }
}
function renderFontResults(){
  const query=$("fontSearch").value.trim().toLowerCase();
  const results=fontCatalog.filter(f=>f.family.toLowerCase().includes(query)).slice(0,100);
  fontLoaded=results.length;
  $("fontResults").innerHTML=results.map((f,i)=>`
    <div class="font-card">
      <div class="font-name">${escapeHTML(f.family)}</div>
      <div class="sample" style="font-family:'${escapeHTML(f.family).replace(/'/g,"\\'")}',sans-serif">NoteVerse Aa 123</div>
      <button data-preview="${i}">Preview font</button>
      <button data-use="${i}">Use in note</button>
      <button data-download="${i}">Get font</button>
    </div>`).join("");
  $("fontResults").querySelectorAll("[data-preview]").forEach(b=>b.onclick=()=>{
    const f=results[+b.dataset.preview];loadFontPreview(f.family);
    b.closest(".font-card").querySelector(".sample").style.fontFamily=`'${f.family}',sans-serif`;
  });
  $("fontResults").querySelectorAll("[data-use]").forEach(b=>b.onclick=()=>{
    const f=results[+b.dataset.use];loadFontPreview(f.family);
    $("fontSelect").value=f.family;
    if(activeNote()){ $("noteBody").style.fontFamily=`'${f.family}',sans-serif`;updateNote(); }
    toast(`${f.family} selected.`);
  });
  $("fontResults").querySelectorAll("[data-download]").forEach(b=>b.onclick=()=>{
    const f=results[+b.dataset.download];
    window.open("https://fonts.google.com/specimen/"+encodeURIComponent(f.family),"_blank","noopener");
  });
}

/* Tasks */
function renderTasks(){
  $("taskList").innerHTML=state.tasks.map(t=>`
    <div class="task-item ${t.done?"done":""}">
      <input type="checkbox" data-task="${t.id}" ${t.done?"checked":""} aria-label="Mark task complete">
      <span class="task-text">${escapeHTML(t.text)}</span>
      <button data-delete-task="${t.id}" class="danger">Delete</button>
    </div>`).join("");
  $("taskList").querySelectorAll("[data-task]").forEach(c=>c.onchange=()=>{
    const t=state.tasks.find(t=>t.id===c.dataset.task);if(t)t.done=c.checked;save();renderTasks();
  });
  $("taskList").querySelectorAll("[data-delete-task]").forEach(b=>b.onclick=()=>{
    state.tasks=state.tasks.filter(t=>t.id!==b.dataset.deleteTask);save();renderTasks();
  });
}

/* Event wiring */
$("newNote").onclick=makeNote;$("emptyCreate").onclick=makeNote;
$("addFolder").onclick=addFolder;
$("search").addEventListener("input",()=>{currentView="notes";renderNotes();show("listView");});
$("back").onclick=()=>{updateNote();renderNotes();show("listView");};
["noteTitle","noteBody","noteFolder","noteTags","noteColor"].forEach(id=>$(id).addEventListener("input",()=>{updateNote();updateWordCount();}));
$("noteFolder").onchange=()=>{updateNote();renderFolders();};
$("fontSelect").onchange=()=>{const n=activeNote();if(n)loadFontPreview($("fontSelect").value);$("noteBody").style.fontFamily=$("fontSelect").value;updateNote();};
$("fontSize").onchange=()=>{$("noteBody").style.fontSize=$("fontSize").value+"px";updateNote();};
document.querySelectorAll("[data-insert]").forEach(b=>b.onclick=()=>{
  const area=$("noteBody"),start=area.selectionStart,end=area.selectionEnd,mark=b.dataset.insert;
  area.setRangeText(mark+area.value.slice(start,end)+(mark.trim()?"":""),start,end,"end");
  area.focus();updateNote();updateWordCount();
});
$("favorite").onclick=()=>{const n=activeNote();if(!n)return;n.favorite=!n.favorite;save();fillEditor(n);};
$("lockNote").onclick=toggleLock;
$("deleteNote").onclick=()=>{
  const n=activeNote();if(!n)return;
  if(confirm("Delete this note permanently?")){
    state.notes=state.notes.filter(x=>x.id!==n.id);currentId=null;save();renderNotes();show("listView");
  }
};
$("downloadNote").onclick=downloadCurrent;
$("exportAll").onclick=exportAll;$("backupBtn").onclick=exportAll;
$("editMode").onclick=editNote;$("previewMode").onclick=previewNote;
$("attachBtn").onclick=()=>$("fileInput").click();
$("fileInput").onchange=async e=>{await attachFiles(e.target.files);e.target.value="";};
$("voiceBtn").onclick=voiceTyping;
$("assistantBtn").onclick=()=>$("assistantPanel").classList.toggle("hidden");
document.querySelectorAll("[data-ai]").forEach(b=>b.onclick=()=>runAssistant(b.dataset.ai));
$("applyAssistant").onclick=applyAssistant;
$("closeModal").onclick=closeModal;$("modalCancel").onclick=closeModal;
$("modalConfirm").onclick=confirmModal;
$("modalInput").addEventListener("keydown",e=>{if(e.key==="Enter")confirmModal();});
$("taskForm").onsubmit=e=>{
  e.preventDefault();const text=$("taskInput").value.trim();if(!text)return;
  state.tasks.push({id:uid(),text,done:false});$("taskInput").value="";save();renderTasks();
};
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>{
  currentView=b.dataset.view;
  const ids={notes:"listView",starred:"listView",tasks:"tasksView",folders:"foldersView",drawing:"drawingView",fonts:"fontsView",settings:"settingsView"};
  renderNotes();show(ids[currentView]||"listView");
});
$("fontSearch").oninput=renderFontResults;
$("clearData").onclick=()=>{
  if(confirm("Delete all notes, tasks, folders and attachments from this browser? This cannot be undone.")){
    localStorage.removeItem(DB);state={notes:[],folders:["Personal","School","Ideas"],tasks:[]};
    currentId=null;save();renderFolders();renderNotes();renderTasks();updateStorageInfo();show("listView");toast("Local data cleared.");
  }
};
$("importInput").onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    const imported=JSON.parse(await file.text());
    if(!Array.isArray(imported.notes)||!Array.isArray(imported.folders)||!Array.isArray(imported.tasks))throw Error("Invalid backup format");
    if(!confirm("Restore this backup? It will replace the current notes and tasks."))return;
    state=imported;save();renderFolders();renderNotes();renderTasks();updateStorageInfo();toast("Backup restored.");
  }catch(err){toast("Could not restore this backup file.");}
  e.target.value="";
};

setupCanvas();
load();
loadFonts();
setTimeout(()=>$("intro").classList.add("done"),2700);