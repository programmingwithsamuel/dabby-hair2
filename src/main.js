import './style.css';
import { supabase, supabaseConfigured, whatsappNumber } from './supabase.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(value || 0));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const placeholderImage = (label = 'Dabby Hair Sensation') => `https://placehold.co/720x880/f1e4df/35131f?text=${encodeURIComponent(label)}`;

let products = [];
const cartStorageKey = 'dabby-cart';
function readCart(value) {
  try {
    const savedValue = value === undefined ? localStorage.getItem(cartStorageKey) : value;
    if (!savedValue) return [];
    const savedCart = JSON.parse(savedValue);
    if (!Array.isArray(savedCart)) throw new Error('Saved bag data is not a list.');
    return savedCart.filter(item =>
      item &&
      typeof item.key === 'string' &&
      item.key &&
      (typeof item.id === 'string' || typeof item.id === 'number') &&
      typeof item.name === 'string' &&
      Number.isFinite(Number(item.price)) &&
      Number(item.price) >= 0 &&
      Number.isInteger(Number(item.quantity)) &&
      Number(item.quantity) > 0
    ).map(item => ({
      ...item,
      price: Number(item.price),
      quantity: Number(item.quantity),
      image: typeof item.image === 'string' ? item.image : '',
    }));
  } catch (error) {
    console.error('Could not read saved bag data.', error);
    return [];
  }
}
let cart = readCart();
let currentProduct = null;
let currentUser = null;
let toastTimer;

const themeOptions = [
  ['light', 'Light · rose & gold'],
  ['dark', 'Dark'],
  ['blue-gold', 'Blue & gold'],
  ['green-yellow', 'Green & yellow'],
  ['violet-rose', 'Violet & rose'],
];
const availableThemes = new Set(themeOptions.map(([value]) => value));
const savedTheme = localStorage.getItem('dabby-theme');
document.documentElement.dataset.theme = availableThemes.has(savedTheme) ? savedTheme : 'light';

const defaultTextureOptions = ['Straight','Body Wave','Loose Wave','Deep Wave','Water Wave','Curly','Kinky Straight','Kinky Curly','Yaki','Jerry Curl'];
const defaultHairTypeOptions = ['Human hair','Synthetic','Human hair blend','Brazilian','Peruvian','Malaysian','Indian'];
const defaultCategoryOptions = ['Wigs','Bundles','Hair accessories','Braiding hair','Synthetic hair','Closures and frontals'];
const readOptions = (key, defaults) => { try { const stored = JSON.parse(localStorage.getItem(`dabby-options-${key}`)); return Array.isArray(stored) && stored.length ? stored : [...defaults]; } catch { return [...defaults]; } };
let textureOptions = readOptions('textures', defaultTextureOptions);
let hairTypeOptions = readOptions('hair-types', defaultHairTypeOptions);
let categoryOptions = readOptions('categories', defaultCategoryOptions);
let selectedGalleryFiles = [];
let selectedMainFile = null;
let savedGalleryUrls = [];
let savedMainUrl = '';
let adminSearchQuery = '';
function persistOptions(key, values) { localStorage.setItem(`dabby-options-${key}`, JSON.stringify(values)); }
function optionMarkup(options, selected = '') { return options.map(x => `<option value="${escapeHtml(x)}" ${x===selected?'selected':''}>${escapeHtml(x)}</option>`).join(''); }

const demoProducts = [
  { id:'demo-1', name:'The Signature Body Wave', category:'Bundles', texture:'Body Wave', hair_type:'Human hair', lengths:[16,18,20,22], price:85000, stock:8, description:'Soft, flowing body wave with beautiful movement. Confirm the available lengths with our team.', image_url:placeholderImage('Body Wave'), gallery_urls:[], is_active:true, featured:true },
  { id:'demo-2', name:'Everyday Sleek Wig', category:'Wigs', texture:'Straight', hair_type:'Human hair', lengths:[12,14,16,18], price:125000, stock:4, description:'A sleek, versatile style for everyday confidence. Ask us to confirm cap and length options.', image_url:placeholderImage('Straight Wig'), gallery_urls:[], is_active:true, featured:true },
  { id:'demo-3', name:'Defined Deep Wave', category:'Bundles', texture:'Deep Wave', hair_type:'Human hair', lengths:[18,20,22,24], price:95000, stock:6, description:'Defined waves with a full, textured look. Product specifications should be confirmed before purchase.', image_url:placeholderImage('Deep Wave'), gallery_urls:[], is_active:true, featured:true },
  { id:'demo-4', name:'Natural Braiding Hair', category:'Braiding hair', texture:'Kinky Straight', hair_type:'Synthetic', lengths:[24,36,48], price:6500, stock:20, description:'A practical option for your next braided style. Ask about colours and pack sizes.', image_url:placeholderImage('Braiding Hair'), gallery_urls:[], is_active:true, featured:false },
  { id:'demo-5', name:'Soft Curl Wig', category:'Wigs', texture:'Curly', hair_type:'Human hair', lengths:[14,16,18,20], price:110000, stock:3, description:'Soft curls that bring texture and volume to your look.', image_url:placeholderImage('Curly Wig'), gallery_urls:[], is_active:true, featured:false },
  { id:'demo-6', name:'Lace Closure', category:'Closures and frontals', texture:'Straight', hair_type:'Human hair', lengths:[12,14,16], price:42000, stock:5, description:'A closure option to complete your install. Confirm lace details and availability with us.', image_url:placeholderImage('Lace Closure'), gallery_urls:[], is_active:true, featured:false },
];

function notify(message) {
  const toast = $('#toast');
  if (!toast) { console.info(message); return; }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function openModal(id) { const el = $(`#${id}`); if (!el) return; el.classList.remove('hidden'); document.body.classList.add('no-scroll'); }
function closeModal(id) { const el = $(`#${id}`); if (el) el.classList.add('hidden'); if ($$('.modal-backdrop:not(.hidden), .drawer-backdrop:not(.hidden)').length === 0) document.body.classList.remove('no-scroll'); }

function waLink(message) {
  if (!whatsappNumber) {
    notify('Add VITE_WHATSAPP_NUMBER to your .env file first.');
    return null;
  }
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}
function openWhatsApp(message) {
  const url = waLink(message);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
function productImage(product) { return product.image_url || placeholderImage(product.name); }
function productPrice(product) { return Number(product.price || 0); }

async function loadProducts() {
  if (supabaseConfigured) {
    const { data, error } = await supabase.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false });
    if (!error && data) {
      products = data;
      renderProducts();
      return;
    }
    console.error(error);
    notify('Could not load store products. Showing demo items.');
  }
  products = demoProducts;
  renderProducts();
}

function renderProducts() {
  const query = ($('#search')?.value || '').trim().toLowerCase();
  const category = $('#category-filter')?.value || '';
  const texture = $('#texture-filter')?.value || '';
  const sort = $('#sort-filter')?.value || 'featured';
  let visible = products.filter(p => p.is_active !== false).filter(p => {
    const matchesQuery = `${p.name} ${p.category} ${p.texture || ''} ${p.description || ''}`.toLowerCase().includes(query);
    return matchesQuery && (!category || p.category === category) && (!texture || p.texture === texture);
  });
  if (sort === 'price-asc') visible.sort((a,b) => productPrice(a)-productPrice(b));
  if (sort === 'price-desc') visible.sort((a,b) => productPrice(b)-productPrice(a));
  if (sort === 'featured') visible.sort((a,b) => Number(Boolean(b.featured))-Number(Boolean(a.featured)));

  const grid = $('#product-grid');
  if (!grid) return;
  if (!visible.length) {
    grid.innerHTML = '<div class="empty-state"><h3>No matching styles yet</h3><p>Try another search or category.</p></div>';
    return;
  }
  grid.innerHTML = visible.map(p => `
    <article class="product-card">
      <button class="product-image-button" data-view-product="${escapeHtml(p.id)}" aria-label="View ${escapeHtml(p.name)}">
        <img src="${escapeHtml(productImage(p))}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.src='${placeholderImage('Dabby Hair')}'">
        ${p.featured ? '<span class="product-badge">FAVOURITE</span>' : ''}
        <span class="quick-view">View details ↗</span>
      </button>
      <div class="product-info">
        <div class="product-meta"><span>${escapeHtml(p.category)}</span><span>${Number(p.stock || 0) > 0 ? 'In stock' : 'Check availability'}</span></div>
        <button class="product-name" data-view-product="${escapeHtml(p.id)}">${escapeHtml(p.name)}</button>
        <p class="product-texture">${escapeHtml(p.texture || 'Ask us about texture')}</p>
        <div class="product-bottom"><strong>${money(productPrice(p))}</strong><button class="add-button" data-add="${escapeHtml(p.id)}" aria-label="Add ${escapeHtml(p.name)} to bag">+</button></div>
      </div>
    </article>`).join('');
}

function openProduct(id) {
  currentProduct = products.find(p => String(p.id) === String(id));
  if (!currentProduct) return;
  const p = currentProduct;
  const lengths = Array.isArray(p.lengths) && p.lengths.length ? p.lengths : [12,14,16,18,20,22,24];
  const images = [productImage(p), ...(Array.isArray(p.gallery_urls) ? p.gallery_urls : [])].filter(Boolean);
  const modalContent = $('#product-modal-content');
  if (!modalContent) return;
  modalContent.innerHTML = `
    <div class="detail-layout">
      <div class="detail-gallery">
        <div class="detail-main-image"><img id="detail-image" src="${escapeHtml(images[0])}" alt="${escapeHtml(p.name)}"></div>
        <div class="gallery-thumbs">${images.map((src,i)=>`<button class="gallery-thumb ${i===0?'selected':''}" data-gallery-src="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt="View ${i+1}"></button>`).join('')}</div>
        ${images.length > 1 ? '<p class="small muted">Choose a view below. A real 360° sequence can be added by uploading ordered angle photos.</p>' : '<p class="small muted">Upload multiple angle photos to enable a 360° image sequence.</p>'}
      </div>
      <div class="detail-copy">
        <p class="eyebrow">${escapeHtml(p.category)}</p><h2>${escapeHtml(p.name)}</h2><p class="detail-price">${money(productPrice(p))}</p>
        <p class="muted">${escapeHtml(p.description || 'Contact us to confirm product details and availability.')}</p>
        <div class="detail-specs"><span>Texture<strong>${escapeHtml(p.texture || 'Ask us')}</strong></span><span>Hair type<strong>${escapeHtml(p.hair_type || 'Ask us')}</strong></span><span>Availability<strong>${Number(p.stock||0)>0?'In stock':'Confirm with us'}</strong></span></div>
        <label class="field-label" for="detail-length">Length</label><select id="detail-length">${lengths.map(l=>`<option value="${escapeHtml(l)}">${escapeHtml(l)}${String(l).includes('"')?'':'"'}</option>`).join('')}</select>
        <label class="field-label" for="detail-quantity">Quantity</label><input id="detail-quantity" type="number" min="1" max="${Math.max(1,Number(p.stock||1))}" value="1">
        <button id="detail-add" class="button button-dark full-width">Add to bag</button>
        <button id="detail-order" class="button button-outline full-width">Ask about this style on WhatsApp ↗</button>
      </div>
    </div>`;
  // Drag horizontally across the main photo to step through ordered angle images.
  // This is a photo-sequence viewer, not a volumetric 3D model.
  const stage = $('.detail-main-image');
  if (stage && images.length > 1) {
    let startX = null;
    let lastStep = 0;
    let activeIndex = 0;
    stage.style.cursor = 'ew-resize';
    stage.addEventListener('pointerdown', event => {
      startX = event.clientX;
      lastStep = 0;
      stage.setPointerCapture?.(event.pointerId);
    });
    stage.addEventListener('pointermove', event => {
      if (startX === null) return;
      const step = Math.trunc((event.clientX - startX) / 18);
      if (step !== lastStep) {
        activeIndex = ((activeIndex - (step - lastStep)) % images.length + images.length) % images.length;
        lastStep = step;
        $('#detail-image').src = images[activeIndex];
        $$('.gallery-thumb').forEach((el, index) => el.classList.toggle('selected', index === activeIndex));
      }
    });
    const endDrag = () => { startX = null; };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
  }
  openModal('product-modal');
}

function addToCart(id, length, quantity = 1) {
  const p = products.find(item => String(item.id) === String(id));
  if (!p) return;
  const qty = Math.max(1, Math.min(Number(quantity)||1, Math.max(1, Number(p.stock)||1)));
  const key = `${p.id}-${length}`;
  const existing = cart.find(item => item.key === key);
  if (existing) existing.quantity = Math.min(existing.quantity + qty, Math.max(1, Number(p.stock)||1));
  else cart.push({ key, id:p.id, name:p.name, price:productPrice(p), length, quantity:qty, image:productImage(p) });
  const saved = saveCart();
  renderCart();
  if (saved) notify('Added to your bag.');
}

function saveCart() {
  try {
    localStorage.setItem(cartStorageKey, JSON.stringify(cart));
    return true;
  } catch (error) {
    console.error('Could not save bag data.', error);
    notify('Your bag changed, but could not be saved on this device.');
    return false;
  }
}

function renderCart() {
  const count = $('#cart-count'); if (count) count.textContent = cart.reduce((sum,item)=>sum+item.quantity,0);
  const total = $('#cart-total'); if (total) total.textContent = money(cart.reduce((sum,item)=>sum+item.price*item.quantity,0));
  const container = $('#cart-items');
  if (!container) return;
  if (!cart.length) {
    container.innerHTML = '<div class="empty-state"><p>Your bag is waiting for its first favourite.</p><a href="#shop" class="text-link" id="continue-shopping">Explore the collection ↗</a></div>';
    return;
  }
  container.innerHTML = cart.map(item=>`<div class="cart-item"><img src="${escapeHtml(item.image)}" alt=""><div class="cart-item-info"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.length)}" · Qty ${item.quantity}</span><b>${money(item.price*item.quantity)}</b><button class="remove-item" data-remove="${escapeHtml(item.key)}">Remove</button></div></div>`).join('');
}

function cartMessage() {
  const lines = cart.map(item=>`• ${item.name} — ${item.length}" × ${item.quantity} = ${money(item.price*item.quantity)}`);
  const total = cart.reduce((sum,item)=>sum+item.price*item.quantity,0);
  return `Hello Dabby Hair Sensation! I'd like to enquire about these items:\n\n${lines.join('\n')}\n\nEstimated total: ${money(total)}\nPlease confirm availability, final pricing and delivery details.`;
}

function renderAdmin() {
  const root = $('#admin-content');
  if (!root) return;
  if (!supabaseConfigured) {
    root.innerHTML = '<p class="eyebrow">STORE SETUP</p><h2>Connect your store</h2><p>Configure the Supabase URL and publishable key in your local .env file, then restart the dev server.</p><a class="button button-dark" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Open Supabase ↗</a>'; 
    return;
  }
  if (!currentUser) {
    root.innerHTML = `<p class="eyebrow">PRIVATE AREA</p><h2>Welcome back.</h2><p class="muted">Sign in with the admin account created in Supabase Authentication.</p><form id="admin-login-form" class="stack-form"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required minlength="8"></label><p id="admin-error" class="form-error"></p><button class="button button-dark full-width" type="submit">Sign in securely</button></form>`;
    return;
  }
  root.innerHTML = `<div class="admin-heading"><div><p class="eyebrow">DABBY CONTROL ROOM</p><h2>Product manager</h2><p class="muted small">${escapeHtml(currentUser.email)}</p></div><div class="admin-heading-actions"><label class="theme-control">Store theme<select id="admin-theme-select">${themeOptions.map(([value,label])=>`<option value="${value}" ${document.documentElement.dataset.theme===value?'selected':''}>${label}</option>`).join('')}</select></label><button id="admin-logout" class="button button-outline">Sign out</button></div></div>
    <form id="product-form" class="stack-form admin-product-form" method="post">
      <input type="hidden" name="id">
      <h3 id="product-form-heading">Add a product</h3>
      <div class="form-grid"><label>Product name<input name="name" required maxlength="120"></label><label>Category<select name="category" required>${optionMarkup(categoryOptions)}</select></label>
      <label>Texture<select name="texture" data-custom-field="texture-custom-field"><option value="">Choose a texture</option>${optionMarkup(textureOptions)}<option value="__other__">Other (enter below)</option></select></label><label id="texture-custom-field" hidden>Custom texture<input name="texture_custom" maxlength="80"></label>
      <label>Hair type<select name="hair_type" data-custom-field="hair-type-custom-field"><option value="">Choose a hair type</option>${optionMarkup(hairTypeOptions)}<option value="__other__">Other (enter below)</option></select></label><label id="hair-type-custom-field" hidden>Custom hair type<input name="hair_type_custom" maxlength="80"></label>
      <label>Price (NGN)<input name="price" type="number" min="0" step="1" required></label><label>Stock<input name="stock" type="number" min="0" step="1" required></label></div>
      <label>Description<textarea name="description" rows="3"></textarea></label>
      <div class="upload-panel"><div><p class="eyebrow">PRODUCT PHOTOS</p><h3>Show every beautiful detail</h3><p class="muted small">Choose photos from your device or use your phone camera. Uploads are saved to Supabase Storage.</p></div><label class="upload-drop"><span class="upload-icon">＋</span><strong>Choose main photo</strong><small>JPG, PNG or WEBP · up to 8 MB</small><input name="image_file" id="image-file" type="file" accept="image/*"></label><label class="upload-drop camera-drop"><span class="upload-icon">◎</span><strong>Take a photo now</strong><small>On supported phones, opens camera</small><input name="camera_file" id="camera-file" type="file" accept="image/*" capture="environment"></label><label class="upload-drop gallery-drop"><span class="upload-icon">▧</span><strong>Add gallery / 360° angles</strong><small>Select multiple ordered photos</small><input name="gallery_files" id="gallery-files" type="file" accept="image/*" multiple></label><div id="image-preview" class="image-preview"><span class="muted small">Your selected photos will appear here.</span></div><input name="image_url" type="hidden"><input name="gallery_urls" type="hidden"></div>
      <label>Available lengths, comma-separated<input name="lengths" placeholder="12, 14, 16, 18"></label>
      <label class="checkbox-field"><input name="featured" type="checkbox"> Feature on the homepage</label>
      <label class="checkbox-field"><input name="is_active" type="checkbox" checked> Visible in store</label>
      <div class="form-actions"><button class="button button-dark" type="submit">Save product</button><button class="button button-outline" id="product-form-reset" type="button">Clear form</button></div>
      <p id="product-form-error" class="form-error"></p>
    </form>
    <section class="option-manager"><div><p class="eyebrow">PERSONALISE YOUR WORKFLOW</p><h3>Manage dropdown options</h3><p class="muted small">Add or remove textures, hair types and categories without editing code. Options are saved in this browser.</p></div><div class="option-manager-grid"><form data-option-form="textures"><label>Hair textures<input name="option" placeholder="e.g. Mermaid Wave" maxlength="80" required></label><button class="button button-outline button-small">Add texture</button><div class="option-chips" data-option-list="textures"></div></form><form data-option-form="hair-types"><label>Hair types<input name="option" placeholder="e.g. Raw Vietnamese" maxlength="80" required></label><button class="button button-outline button-small">Add hair type</button><div class="option-chips" data-option-list="hair-types"></div></form><form data-option-form="categories"><label>Categories<input name="option" placeholder="e.g. Ponytails" maxlength="80" required></label><button class="button button-outline button-small">Add category</button><div class="option-chips" data-option-list="categories"></div></form></div></section><div class="admin-products"><div class="admin-list-heading"><h3>Current products</h3><input id="admin-product-search" type="search" placeholder="Search products…" aria-label="Search admin products"></div><div id="admin-product-list">Loading products…</div></div>`;
  const productForm = $('#product-form');
  productForm.addEventListener('submit', event => {
    event.preventDefault();
    saveProduct();
  });
  productForm.addEventListener('change', event => {
    if (event.target.matches('[data-custom-field]')) {
      const customField = $(`#${event.target.dataset.customField}`, productForm);
      customField.hidden = event.target.value !== '__other__';
      customField.querySelector('input').required = !customField.hidden;
      if (customField.hidden) customField.querySelector('input').value = '';
    }
  });
  $$('[data-option-form]').forEach(optionForm=>optionForm.addEventListener('submit',event=>{
    event.preventDefault(); const key=optionForm.dataset.optionForm; const input=optionForm.elements.option; const value=input.value.trim();
    if(!value) return;
    const ref=key==='textures'?textureOptions:key==='hair-types'?hairTypeOptions:categoryOptions;
    if(ref.some(x=>x.toLowerCase()===value.toLowerCase())) { notify('That option already exists.'); return; }
    ref.push(value); persistOptions(key,ref); input.value=''; refreshProductOptionSelects(); renderOptionChips(); notify('Dropdown option added.');
  }));
  $('#admin-product-search').addEventListener('input',event=>{adminSearchQuery=event.target.value;loadAdminProducts();});
  $('#admin-theme-select').addEventListener('change', event => {
    document.documentElement.dataset.theme = event.target.value;
    localStorage.setItem('dabby-theme', event.target.value);
  });
  setupImagePreview();
  renderOptionChips();
  loadAdminProducts();
}

function setupImagePreview() {
  const form = $('#product-form'); const preview = $('#image-preview');
  if (!form || !preview) return;
  const mainInput = $('#image-file', form), cameraInput = $('#camera-file', form), galleryInput = $('#gallery-files', form);
  const render = () => {
    const items = [];
    if (selectedMainFile) items.push({kind:'new-main',src:URL.createObjectURL(selectedMainFile),label:'Main photo'});
    else if (savedMainUrl) items.push({kind:'saved-main',src:savedMainUrl,label:'Current main'});
    selectedGalleryFiles.forEach((file,i)=>items.push({kind:'new-gallery',index:i,src:URL.createObjectURL(file),label:`Gallery ${i+1}`}));
    savedGalleryUrls.forEach((url,i)=>items.push({kind:'saved-gallery',index:i,src:url,label:`Saved gallery ${i+1}`}));
    preview.innerHTML = items.length ? items.map((item,i)=>`<div class="preview-tile"><img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.label)}"><span>${escapeHtml(item.label)}</span><div class="preview-actions"><button type="button" data-image-main="${i}" title="Use as main image">${i===0?'Main':'Set main'}</button><button type="button" data-image-remove="${i}" aria-label="Remove image">×</button></div></div>`).join('') : '<span class="muted small">Your selected photos will appear here.</span>';
    preview._items = items;
  };
  [mainInput,cameraInput].forEach(input=>input?.addEventListener('change',()=>{ if(input.files?.[0]) { selectedMainFile=input.files[0]; mainInput.value=''; cameraInput.value=''; } render(); }));
  galleryInput?.addEventListener('change',()=>{ selectedGalleryFiles.push(...[...(galleryInput.files||[])]); galleryInput.value=''; render(); });
  preview._render = render; render();
}

function renderOptionChips() {
  const groups = {textures:textureOptions,'hair-types':hairTypeOptions,categories:categoryOptions};
  for (const [key,values] of Object.entries(groups)) {
    const host = $(`[data-option-list="${key}"]`); if (!host) continue;
    host.innerHTML = values.map(value=>`<span class="option-chip">${escapeHtml(value)}<button type="button" data-remove-option="${escapeHtml(key)}" data-option-value="${escapeHtml(value)}" aria-label="Remove ${escapeHtml(value)}">×</button></span>`).join('');
  }
}
function refreshProductOptionSelects() {
  const form=$('#product-form'); if(!form) return;
  const current={category:form.elements.category.value,texture:form.elements.texture.value,hair_type:form.elements.hair_type.value};
  form.elements.category.innerHTML=optionMarkup(categoryOptions,current.category);
  form.elements.texture.innerHTML='<option value="">Choose a texture</option>'+optionMarkup(textureOptions,current.texture)+'<option value="__other__">Other (enter below)</option>';
  form.elements.hair_type.innerHTML='<option value="">Choose a hair type</option>'+optionMarkup(hairTypeOptions,current.hair_type)+'<option value="__other__">Other (enter below)</option>';
}

async function uploadImageFile(file) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image file.`);
  if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} is larger than 8 MB. Choose a smaller image.`);
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const path = `${currentUser.id}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from('product-images').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw new Error(`Image upload failed: ${error.message}. Check the product-images bucket and admin storage policies in Supabase.`);
  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Upload succeeded but Supabase did not return a public image URL.');
  return data.publicUrl;
}

async function loadAdminProducts() {
  if (!supabase || !currentUser) return;
  const list = $('#admin-product-list');
  if (!list) return;
  const {data,error} = await supabase.from('products').select('*').order('created_at',{ascending:false});
  if (error) { list.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; return; }
  products = data;
  const q = adminSearchQuery.trim().toLowerCase();
  const filtered = data.filter(p=>`${p.name} ${p.category} ${p.texture||''} ${p.hair_type||''}`.toLowerCase().includes(q));
  list.innerHTML = filtered.length ? filtered.map(p=>`<div class="admin-product-row"><img src="${escapeHtml(productImage(p))}" alt=""><div><strong>${escapeHtml(p.name)}</strong><span>${money(p.price)} · Stock ${Number(p.stock)} · ${p.is_active?'Visible':'Hidden'}</span></div><div class="admin-product-actions"><button class="button button-outline button-small" data-edit-product="${escapeHtml(p.id)}">Edit</button><button class="button button-outline button-small button-danger" data-delete-product="${escapeHtml(p.id)}">Delete</button></div></div>`).join('') : '<p class="muted">No products yet. Add your first product above.</p>';
}

async function checkAdminSession() {
  if (!supabaseConfigured) return;
  const {data:{session}} = await supabase.auth.getSession();
  if (!session) { currentUser = null; return; }
  const {data,error} = await supabase.from('admin_users').select('user_id').eq('user_id',session.user.id).maybeSingle();
  currentUser = !error && data ? session.user : null;
  if (!currentUser) {
    await supabase.auth.signOut();
    notify('This account is not approved for admin access.');
  }
}

function fillProductForm(id) {
  const p = products.find(item=>String(item.id)===String(id));
  if (!p) return;
  const form = $('#product-form');
  if (!form) return;
  for (const key of ['id','name','category','price','stock','description','image_url']) if (form.elements[key]) form.elements[key].value = p[key] ?? '';
  for (const [field,customField] of [['texture','texture_custom'],['hair_type','hair_type_custom']]) {
    const value = p[field] ?? '';
    const options = [...form.elements[field].options].map(option=>option.value);
    const isCustom = value && !options.includes(value);
    form.elements[field].value = isCustom ? '__other__' : value;
    form.elements[customField].value = isCustom ? value : '';
    const customInput = form.elements[customField];
    customInput.required = Boolean(isCustom);
    $(`#${field === 'texture' ? 'texture-custom-field' : 'hair-type-custom-field'}`,form).hidden = !isCustom;
  }
  form.elements.lengths.value = (p.lengths || []).join(', ');
  form.elements.gallery_urls.value = (p.gallery_urls || []).join(', ');
  selectedMainFile=null; selectedGalleryFiles=[]; savedMainUrl=p.image_url||''; savedGalleryUrls=[...(p.gallery_urls||[])]; setupImagePreview();
  form.elements.featured.checked = Boolean(p.featured);
  form.elements.is_active.checked = Boolean(p.is_active);
  $('#product-form-heading').textContent = 'Edit product';
  form.scrollIntoView({behavior:'smooth',block:'start'});
}

function clearProductForm() {
  const form = $('#product-form');
  if (!form) return;
  form.reset(); form.elements.id.value = '';
  selectedMainFile=null; selectedGalleryFiles=[]; savedMainUrl=''; savedGalleryUrls=[];
  $('#texture-custom-field',form).hidden = true;
  $('#hair-type-custom-field',form).hidden = true;
  form.elements.texture_custom.required = false;
  form.elements.hair_type_custom.required = false;
  $('#product-form-heading').textContent = 'Add a product';
}

async function saveProduct() {
  const form = $('#product-form');
  if (!form) return;
  const errorBox = $('#product-form-error');
  errorBox.textContent = '';
  const value = name => form.elements[name].value;
  const id = value('id');
  const existing = id ? products.find(p=>String(p.id)===String(id)) : null;
  const product = {
    name:value('name').trim(), category:value('category'),
    texture:(value('texture') === '__other__' ? value('texture_custom') : value('texture')).trim() || null,
    hair_type:(value('hair_type') === '__other__' ? value('hair_type_custom') : value('hair_type')).trim() || null,
    price:Number(value('price')), stock:Number(value('stock')),
    description:value('description').trim() || null,
    image_url:savedMainUrl || existing?.image_url || null,
    lengths:value('lengths').split(',').map(x=>Number(x.trim())).filter(x=>Number.isFinite(x)&&x>0),
    gallery_urls:[...savedGalleryUrls],
    featured:form.elements.featured.checked, is_active:form.elements.is_active.checked
  };
  if (!product.name || product.price < 0 || product.stock < 0) { errorBox.textContent = 'Enter a product name and valid non-negative price and stock.'; return; }
  const mainFile = $('#image-file')?.files?.[0] || $('#camera-file')?.files?.[0];
  const galleryFiles = [...($('#gallery-files')?.files || [])];
  const saveButton = form.querySelector('button[type="submit"]');
  saveButton.disabled = true; saveButton.textContent = 'Uploading and saving…';
  try {
    if (selectedMainFile) product.image_url = await uploadImageFile(selectedMainFile);
    if (selectedGalleryFiles.length) {
      const uploaded = [];
      for (const file of selectedGalleryFiles) uploaded.push(await uploadImageFile(file));
      product.gallery_urls = [...savedGalleryUrls, ...uploaded];
    }
    const request = id ? supabase.from('products').update(product).eq('id',id) : supabase.from('products').insert(product);
    const {error} = await request;
    if (error) throw new Error(error.message);
    notify(id ? 'Product updated.' : 'Product created.');
    clearProductForm();
    const {data,error:reloadError} = await supabase.from('products').select('*').order('created_at',{ascending:false});
    if (reloadError) throw new Error(reloadError.message);
    if (data) { products = data.filter(p=>p.is_active); renderProducts(); await loadAdminProducts(); }
    selectedMainFile=null; selectedGalleryFiles=[]; savedMainUrl=''; savedGalleryUrls=[];
    setupImagePreview();
  } catch (err) {
    errorBox.textContent = err.message || 'Could not save this product.';
  } finally {
    saveButton.disabled = false; saveButton.textContent = 'Save product';
  }
}

document.addEventListener('click', async event => {
  const target = event.target.closest('button, a');
  if (!target) return;
  if (target.dataset.close) { closeModal(target.dataset.close); return; }
  if (target.id === 'cart-open' && $('#cart-drawer')) { $('#cart-drawer').classList.remove('hidden'); document.body.classList.add('no-scroll'); }
  if (target.id === 'cart-close' && $('#cart-drawer')) { $('#cart-drawer').classList.add('hidden'); document.body.classList.remove('no-scroll'); }
  if (target.id === 'admin-open') { renderAdmin(); openModal('admin-modal'); }
  if (target.id === 'continue-shopping' && $('#cart-drawer')) { $('#cart-drawer').classList.add('hidden'); document.body.classList.remove('no-scroll'); }
  if (target.dataset.viewProduct) openProduct(target.dataset.viewProduct);
  if (target.dataset.add) addToCart(target.dataset.add, 16, 1);
  if (target.dataset.remove) { cart = cart.filter(item=>item.key!==target.dataset.remove); saveCart(); renderCart(); }
  if (target.dataset.gallerySrc) {
    $('#detail-image').src = target.dataset.gallerySrc;
    $$('.gallery-thumb').forEach(el=>el.classList.toggle('selected',el===target));
  }
  if (target.dataset.texture) {
    const filter = $('#texture-filter'); if (filter) filter.value = target.dataset.texture;
    renderProducts();
    $('#shop')?.scrollIntoView({behavior:'smooth'});
  }
  if (target.id === 'detail-add' && currentProduct) {
    addToCart(currentProduct.id, $('#detail-length')?.value || 16, $('#detail-quantity')?.value || 1);
    closeModal('product-modal');
  }
  if (target.id === 'detail-order' && currentProduct) {
    const p = currentProduct;
    openWhatsApp(`Hello Dabby Hair Sensation! I'd like to ask about ${p.name}, ${$('#detail-length')?.value || ''}" length. Please confirm availability and final price.`);
  }
  if (target.id === 'checkout-whatsapp') {
    if (!cart.length) { notify('Your bag is empty.'); return; }
    openWhatsApp(cartMessage());
  }
  if (target.id === 'admin-logout') {
    await supabase.auth.signOut(); currentUser = null; renderAdmin(); notify('You have signed out.');
  }
  if (target.dataset.editProduct) fillProductForm(target.dataset.editProduct);
  if (target.dataset.deleteProduct) {
    const product = products.find(item=>String(item.id)===String(target.dataset.deleteProduct));
    if (!product || !window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    const {error} = await supabase.from('products').delete().eq('id',product.id);
    if (error) { notify(`Could not delete product: ${error.message}`); return; }
    notify('Product deleted.');
    await loadAdminProducts();
    renderProducts();
  }
  if (target.id === 'product-form-reset') { clearProductForm(); setupImagePreview(); }
  if (target.dataset.imageMain !== undefined) {
    const items=$('#image-preview')?._items||[]; const item=items[Number(target.dataset.imageMain)]; if(!item)return;
    if(item.kind==='new-gallery'){selectedMainFile=selectedGalleryFiles.splice(item.index,1)[0];}
    else if(item.kind==='saved-gallery'){savedMainUrl=savedGalleryUrls.splice(item.index,1)[0];}
    else if(item.kind==='saved-main'){savedMainUrl=item.src;}
    else if(item.kind==='new-main'){selectedMainFile=selectedMainFile;}
    setupImagePreview();
  }
  if (target.dataset.imageRemove !== undefined) {
    const items=$('#image-preview')?._items||[]; const item=items[Number(target.dataset.imageRemove)]; if(!item)return;
    if(item.kind==='new-main') selectedMainFile=null;
    if(item.kind==='saved-main') savedMainUrl='';
    if(item.kind==='new-gallery') selectedGalleryFiles.splice(item.index,1);
    if(item.kind==='saved-gallery') savedGalleryUrls.splice(item.index,1);
    setupImagePreview();
  }
  if (target.dataset.removeOption) {
    const key=target.dataset.removeOption, value=target.dataset.optionValue;
    const ref=key==='textures'?textureOptions:key==='hair-types'?hairTypeOptions:categoryOptions;
    if(ref.length<=1){notify('Keep at least one option in each list.');return;}
    if(!window.confirm(`Remove “${value}” from this dropdown? Existing products will not be changed.`))return;
    const index=ref.indexOf(value); if(index>=0)ref.splice(index,1); persistOptions(key,ref); refreshProductOptionSelects(); renderOptionChips(); notify('Dropdown option removed.');
  }
});

window.addEventListener('storage', event => {
  if (event.key !== cartStorageKey) return;
  cart = readCart(event.newValue);
  renderCart();
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'admin-login-form') {
    event.preventDefault();
    const form = event.target;
    const errorBox = $('#admin-error');
    errorBox.textContent = '';
    const {data,error} = await supabase.auth.signInWithPassword({email:form.elements.email.value.trim(),password:form.elements.password.value});
    if (error) { errorBox.textContent = error.message; return; }
    const {data:admin,error:adminError} = await supabase.from('admin_users').select('user_id').eq('user_id',data.user.id).maybeSingle();
    if (adminError || !admin) {
      await supabase.auth.signOut();
      errorBox.textContent = 'This account is not approved as an admin. Add its user ID to the admin_users table using the setup guide.';
      return;
    }
    currentUser = data.user;
    renderAdmin();
    notify('Signed in successfully.');
  }

});

['search','category-filter','texture-filter','sort-filter'].forEach(id => $(`#${id}`)?.addEventListener('input',renderProducts));
if ($('#year')) $('#year').textContent = new Date().getFullYear();
$('#contact-whatsapp')?.addEventListener('click',event=>{
  const url = waLink('Hello Dabby Hair Sensation! I would like help choosing a hair style.');
  if (!url) { event.preventDefault(); return; }
  event.currentTarget.href = url;
});

if (supabaseConfigured) supabase.auth.onAuthStateChange((_event, session) => { currentUser = session?.user || null; });
if ($('#admin-content')) {
  await checkAdminSession();
  renderAdmin();
} else if ($('#product-grid')) {
  await loadProducts();
  renderCart();
} else if ($('#contact-whatsapp')) {
  // Landing page needs no product queries.
}
