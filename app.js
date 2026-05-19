// =============================
// SUPABASE CONFIG
// =============================

const SUPABASE_URL = "https://yqjmrgutfcnqbfmprbix.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxam1yZ3V0ZmNucWJmbXByYml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwODE2MTYsImV4cCI6MjA5MzY1NzYxNn0.uuQASHyr-EOLTnYabvA3Qua2wrsYaFNZSNEZv_p-qOA";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// =============================
// TELEGRAM CONFIG
// =============================

const BOT_TOKEN = "8601298792:AAEKGQxIlDhlPcgnWESK7rdNnDiu-aGPmjE";
const CHAT_ID = "8669042491";

// =============================

let mangoes = [];

const cart = {};

// =============================
// LOAD MANGOES
// =============================

async function loadMangoes() {

  const { data, error } = await supabaseClient
    .from('mango_stock')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error(error);
    showToast("Failed to load mangoes");
    return;
  }

  mangoes = data;

  renderMangoes();
}

loadMangoes();

// =============================
// RENDER MANGOES
// =============================

function renderMangoes() {

  const grid = document.getElementById('mangoGrid');

  grid.innerHTML = '';

  mangoes.forEach(m => {

    const qty = cart[m.id]?.quantity || 0;

    const remainingStock = m.stock_kg - qty;

    const isSoldOut = m.stock_kg <= 0;

    const card = document.createElement('div');

    card.className = 'mango-card';

    if (qty > 0) card.classList.add('selected');
    if (isSoldOut) card.classList.add('sold-out');

    card.innerHTML = `
      <div class="pg-card-top">
        <div class="emoji">${m.emoji}</div>
      </div>
      <div class="pg-card-bot">
        <div class="pg-card-name">${m.name}</div>
        <div class="pg-card-origin">${m.origin}</div>
        <div class="pg-card-price">₹${m.price_per_kg}/KG</div>

        ${isSoldOut
          ? `<div class="soldout-badge">SOLD OUT</div>`
          : `<div class="pg-card-stock">${remainingStock} KG left</div>
             <div class="qty-control">
               <button class="qty-btn" onclick="decreaseQty('${m.id}')">−</button>
               <div class="qty-display">${qty} KG</div>
               <button class="qty-btn" onclick="increaseQty('${m.id}')"
                 ${qty + 5 > m.stock_kg ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>+</button>
             </div>`
        }
      </div>
    `;

    grid.appendChild(card);
  });

  updateCartUI();
}

// =============================
// INCREASE QTY
// =============================

function increaseQty(id) {
  const mango = mangoes.find(m => m.id === id);
  if (!mango) return;

  if (!cart[id]) {
    cart[id] = { ...mango, quantity: 0 };
  }

  const currentQty = cart[id].quantity;

  if (currentQty + 5 > mango.stock_kg) {
    showToast(`Only ${mango.stock_kg} KG available`);
    return;
  }

  cart[id].quantity += 5;
  renderMangoes();
}

// =============================
// DECREASE QTY
// =============================

function decreaseQty(id) {
  if (!cart[id]) return;

  cart[id].quantity -= 5;

  if (cart[id].quantity <= 0) {
    delete cart[id];
  }

  renderMangoes();
}

// =============================
// UPDATE CART UI
// =============================

function updateCartUI() {

  const items = Object.values(cart);

  const totalKg = items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const totalPrice = items.reduce(
    (sum, item) => sum + (item.quantity * item.price_per_kg),
    0
  );

  document.getElementById('cartText').innerHTML =
    `<strong>${totalKg} KG</strong> &nbsp;•&nbsp; ₹${totalPrice}`;
}

// =============================
// PLACE ORDER
// =============================

async function placeOrder() {

  const name    = document.getElementById('customerName').value.trim();
  const phone   = document.getElementById('customerPhone').value.trim();
  const address = document.getElementById('customerAddress').value.trim();

  const items = Object.values(cart);

  if (items.length === 0) {
    showToast("Add mangoes first");
    return;
  }

  if (!name || !phone || !address) {
    showToast("Fill all details");
    return;
  }

  // =============================
  // FINAL STOCK VALIDATION
  // =============================

  const { data: latestStock, error: stockError } =
    await supabaseClient
      .from('mango_stock')
      .select('*');

  if (stockError) {
    console.error(stockError);
    showToast("Stock validation failed");
    return;
  }

  for (const item of items) {

    const latest = latestStock.find(m => m.id === item.id);

    if (!latest) {
      showToast(`${item.name} unavailable`);
      return;
    }

    if (item.quantity > latest.stock_kg) {
      showToast(`${item.name} only has ${latest.stock_kg} KG left`);
      loadMangoes();
      return;
    }
  }

  const totalKg = items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const totalPrice = items.reduce(
    (sum, item) => sum + (item.quantity * item.price_per_kg),
    0
  );

  // =============================
  // SAVE ORDER
  // =============================

  const { error } = await supabaseClient
    .from('orders')
    .insert({
      customer_name: name,
      phone,
      address,
      order_data: items,
      total_kg: totalKg,
      total_price: totalPrice
    });

  if (error) {
    console.error(error);
    showToast("Order failed");
    return;
  }

  // =============================
  // UPDATE STOCK
  // =============================

  for (const item of items) {

    const latest = latestStock.find(m => m.id === item.id);
    const newStock = latest.stock_kg - item.quantity;

    await supabaseClient
      .from('mango_stock')
      .update({ stock_kg: newStock })
      .eq('id', item.id);
  }

  // =============================
  // TELEGRAM MESSAGE
  // =============================

  const itemsText = items.map(item =>
    `• ${item.name} × ${item.quantity} KG`
  ).join('\n');

  const telegramMessage = `
🥭 New Mango Order

${itemsText}

💰 Total: ₹${totalPrice}

👤 ${name}
📞 ${phone}
📍 ${address}
`;

  try {
    await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text: telegramMessage })
      }
    );
  } catch (err) {
    console.error(err);
  }

  // =============================
  // RESET
  // =============================

  showToast("Order placed successfully! 🥭");

  Object.keys(cart).forEach(k => delete cart[k]);

  document.getElementById('customerName').value = '';
  document.getElementById('customerPhone').value = '';
  document.getElementById('customerAddress').value = '';

  loadMangoes();
}

// =============================
// TOAST
// =============================

function showToast(msg) {

  const toast = document.getElementById('toast');

  toast.innerText = msg;
  toast.style.display = 'block';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}
