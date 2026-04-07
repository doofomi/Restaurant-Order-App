const menuItems = [
  {
    id: "smoky-burger",
    name: "Smoky Burger",
    description: "Chargrilled beef, aged cheddar, pickled onions, and house sauce.",
    price: 14.5
  },
  {
    id: "truffle-fries",
    name: "Truffle Fries",
    description: "Crisp fries with parmesan, rosemary salt, and truffle aioli.",
    price: 7.5
  },
  {
    id: "citrus-salad",
    name: "Citrus Salad",
    description: "Baby greens, citrus segments, avocado, and toasted seeds.",
    price: 10.0
  },
  {
    id: "spicy-pasta",
    name: "Spicy Pasta",
    description: "Rigatoni in tomato chili cream with basil and confit garlic.",
    price: 16.75
  },
  {
    id: "grilled-salmon",
    name: "Grilled Salmon",
    description: "Atlantic salmon, lemon butter, and herb rice.",
    price: 19.25
  },
  {
    id: "ginger-fizz",
    name: "Ginger Fizz",
    description: "Sparkling ginger-citrus cooler finished with mint.",
    price: 4.5
  }
];

const statusConfig = {
  on_hold: {
    label: "On hold",
    customerMessage: "The order is being reviewed because one or more service checks need attention before fulfillment can begin.",
    eta: "Awaiting service confirmation"
  },
  paid: {
    label: "Paid",
    customerMessage: "Payment approved. The restaurant has received your order and started processing immediately.",
    eta: "Kitchen queue started"
  },
  preparing: {
    label: "Preparing",
    customerMessage: "Your order is being prepared by the restaurant team.",
    eta: "In the kitchen"
  },
  ready: {
    label: "Ready",
    customerMessage: "Your order is ready. Pickup customers can head to the counter, and delivery orders are ready for dispatch.",
    eta: "Ready now"
  },
  out_for_delivery: {
    label: "Out for delivery",
    customerMessage: "Your order has left the restaurant and is on the way.",
    eta: "Courier en route"
  },
  completed: {
    label: "Completed",
    customerMessage: "Order completed. Thank you for using SwiftServe.",
    eta: "Closed"
  }
};

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD"
});

const state = {
  orders: loadOrders(),
  lastResetAt: null
};

const elements = {
  orderForm: document.getElementById("order-form"),
  menuSelect: document.getElementById("menu-select"),
  menuQuantity: document.getElementById("menu-quantity"),
  addMenuItem: document.getElementById("add-menu-item"),
  restartOrder: document.getElementById("restart-order"),
  selectedItems: document.getElementById("selected-items"),
  subtotal: document.getElementById("subtotal"),
  serviceFee: document.getElementById("service-fee"),
  deliveryFee: document.getElementById("delivery-fee"),
  grandTotal: document.getElementById("grand-total"),
  latestOrderPill: document.getElementById("latest-order-pill"),
  progressPercent: document.getElementById("progress-percent"),
  progressFill: document.getElementById("progress-fill"),
  progressLabel: document.getElementById("progress-label"),
  customerStatusCard: document.getElementById("customer-status-card"),
  messageTimeline: document.getElementById("message-timeline"),
  opsSummary: document.getElementById("ops-summary"),
  opsBoard: document.getElementById("ops-board"),
  liveOrderCount: document.getElementById("live-order-count"),
  liveRevenue: document.getElementById("live-revenue")
};

initializeDraftState();
renderMenuOptions();
renderSelectedItems();
syncDeliveryFields();
render();

elements.orderForm.addEventListener("input", event => {
  if (event.target.name === "fulfillment") {
    syncDeliveryFields();
  }

  if (event.target.name === "cardNumber") {
    event.target.value = formatCardNumber(event.target.value);
  }

  if (event.target.name === "cardExpiry") {
    event.target.value = formatExpiry(event.target.value);
  }
  updateTotals();
});

elements.addMenuItem.addEventListener("click", () => {
  const selectedId = elements.menuSelect.value;
  const quantity = Number(elements.menuQuantity.value || 1);

  if (!selectedId) {
    window.alert("Choose a menu item first.");
    return;
  }

  const item = menuItems.find(entry => entry.id === selectedId);
  const existing = state.draftItems.find(entry => entry.id === selectedId);

  if (existing) {
    existing.quantity = Math.min(20, existing.quantity + quantity);
  } else {
    state.draftItems.push({
      ...item,
      quantity: Math.min(20, quantity)
    });
  }

  elements.menuSelect.value = "";
  elements.menuQuantity.value = "1";
  renderSelectedItems();
  updateTotals();
});

elements.restartOrder.addEventListener("click", () => {
  resetDraftOrder();
});

elements.orderForm.addEventListener("submit", event => {
  event.preventDefault();

  const formData = new FormData(elements.orderForm);
  const selectedItems = getDraftItems();

  if (!selectedItems.length) {
    window.alert("Add at least one menu item before payment.");
    return;
  }

  const fulfillment = formData.get("fulfillment");
  const address = String(formData.get("address") || "").trim();

  if (fulfillment === "delivery" && !address) {
    window.alert("Delivery orders require an address.");
    return;
  }

  const totals = calculateTotals(selectedItems, fulfillment);
  const orderNumber = generateOrderNumber();
  const submittedAt = new Date().toLocaleString();

  const draftOrder = {
    id: crypto.randomUUID(),
    orderNumber,
    customerName: String(formData.get("customerName")).trim(),
    customerPhone: String(formData.get("customerPhone")).trim(),
    fulfillment,
    address,
    timeSlot: String(formData.get("timeSlot")).trim(),
    payment: {
      cardholder: String(formData.get("cardName")).trim(),
      maskedCard: maskCardNumber(String(formData.get("cardNumber")).trim())
    },
    items: selectedItems,
    totals,
    submittedAt,
    messages: []
  };

  const serviceChecks = evaluateServiceChecks(draftOrder, state.orders);
  const initialStatus = serviceChecks.allPassed ? "paid" : "on_hold";

  const newOrder = {
    ...draftOrder,
    serviceChecks,
    status: initialStatus,
    messages: buildInitialMessages(orderNumber, submittedAt, serviceChecks)
  };

  state.orders.unshift(newOrder);
  persistOrders();
  resetDraftOrder();
  render();
});

elements.selectedItems.addEventListener("input", event => {
  const input = event.target.closest("input[data-item-id]");
  if (!input) {
    return;
  }

  const item = state.draftItems.find(entry => entry.id === input.dataset.itemId);
  if (!item) {
    return;
  }

  item.quantity = Math.max(1, Math.min(20, Number(input.value) || 1));
  input.value = String(item.quantity);
  updateTotals();
});

elements.selectedItems.addEventListener("click", event => {
  const button = event.target.closest("button[data-remove-id]");
  if (!button) {
    return;
  }

  state.draftItems = state.draftItems.filter(item => item.id !== button.dataset.removeId);
  renderSelectedItems();
  updateTotals();
});

elements.opsBoard.addEventListener("click", event => {
  const button = event.target.closest("button[data-order-id][data-next-status]");
  if (!button) {
    return;
  }

  const order = state.orders.find(entry => entry.id === button.dataset.orderId);
  if (!order) {
    return;
  }

  const nextStatus = button.dataset.nextStatus;

  if (nextStatus === "recheck") {
    order.serviceChecks = evaluateServiceChecks(order, state.orders.filter(entry => entry.id !== order.id));

    if (order.serviceChecks.allPassed) {
      order.status = "paid";
      order.messages.unshift(
        buildMessage(
          "Service checks passed",
          "The restaurant re-ran the service checks and the order is now approved for preparation.",
          new Date().toLocaleString()
        )
      );
    } else {
      order.messages.unshift(
        buildMessage(
          "Service checks still pending",
          "The order remains on hold because one or more customer or restaurant checks are still failing.",
          new Date().toLocaleString()
        )
      );
    }

    persistOrders();
    render();
    return;
  }

  order.status = nextStatus;
  order.messages.unshift(
    buildMessage(
      statusConfig[nextStatus].label,
      statusConfig[nextStatus].customerMessage,
      new Date().toLocaleString()
    )
  );

  persistOrders();
  render();
});

function initializeDraftState() {
  state.draftItems = [];
}

function resetDraftOrder() {
  state.draftItems = [];
  state.lastResetAt = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  elements.orderForm.reset();
  elements.menuSelect.value = "";
  elements.menuQuantity.value = "1";
  syncDeliveryFields();
  renderSelectedItems();
  updateTotals();
}

function renderMenuOptions() {
  menuItems.forEach(item => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.name} • ${currency.format(item.price)}`;
    elements.menuSelect.appendChild(option);
  });
}

function updateTotals() {
  const formData = new FormData(elements.orderForm);
  const selectedItems = getDraftItems();
  const fulfillment = formData.get("fulfillment") || "delivery";
  const totals = calculateTotals(selectedItems, fulfillment);

  elements.subtotal.textContent = currency.format(totals.subtotal);
  elements.serviceFee.textContent = currency.format(totals.serviceFee);
  elements.deliveryFee.textContent = currency.format(totals.deliveryFee);
  elements.grandTotal.textContent = currency.format(totals.total);
}

function renderSelectedItems() {
  if (!state.draftItems.length) {
    const resetNote = state.lastResetAt
      ? `<p class="muted">Order draft cleared at ${state.lastResetAt}. Start a new order from the dropdown above.</p>`
      : `<p class="muted">No items added yet. Use the dropdown above to build the order.</p>`;
    elements.selectedItems.innerHTML = resetNote;
    return;
  }

  state.lastResetAt = null;

  const template = document.getElementById("selected-item-template");
  elements.selectedItems.innerHTML = "";

  state.draftItems.forEach(item => {
    const fragment = template.content.cloneNode(true);
    fragment.querySelector(".selected-item-name").textContent = item.name;
    fragment.querySelector(".selected-item-description").textContent = item.description;
    fragment.querySelector(".price-tag").textContent = currency.format(item.price);

    const input = fragment.querySelector("input");
    input.value = String(item.quantity);
    input.dataset.itemId = item.id;
    input.setAttribute("aria-label", `${item.name} quantity`);

    const removeButton = fragment.querySelector(".remove-item-button");
    removeButton.dataset.removeId = item.id;

    elements.selectedItems.appendChild(fragment);
  });
}

function calculateTotals(items, fulfillment) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const serviceFee = subtotal * 0.08;
  const deliveryFee = fulfillment === "delivery" && subtotal > 0 ? 5.5 : 0;
  const total = subtotal + serviceFee + deliveryFee;

  return {
    subtotal,
    serviceFee,
    deliveryFee,
    total
  };
}

function syncDeliveryFields() {
  const fulfillment = new FormData(elements.orderForm).get("fulfillment") || "delivery";
  const deliveryField = document.querySelector(".delivery-only");
  const addressInput = elements.orderForm.elements.address;
  const isDelivery = fulfillment === "delivery";

  deliveryField.classList.toggle("hidden", !isDelivery);
  addressInput.required = isDelivery;
}

function render() {
  renderCustomerStatus();
  renderProgress();
  renderOpsSummary();
  renderOpsBoard();
  renderHeroStats();
}

function renderProgress() {
  const latestOrder = state.orders[0];
  const progress = latestOrder ? getOrderProgress(latestOrder) : { percent: 0, label: "Start a new order to begin the workflow." };

  elements.progressPercent.textContent = `${progress.percent}%`;
  elements.progressFill.style.width = `${progress.percent}%`;
  elements.progressLabel.textContent = progress.label;
}

function renderCustomerStatus() {
  const latestOrder = state.orders[0];

  if (!latestOrder) {
    elements.latestOrderPill.textContent = "No active order";
    elements.customerStatusCard.innerHTML = `<p class="muted">Place an order to receive your order number, payment confirmation, and restaurant updates.</p>`;
    elements.messageTimeline.innerHTML = "";
    return;
  }

  elements.latestOrderPill.textContent = latestOrder.orderNumber;
  const statusClass = latestOrder.status === "paid" || latestOrder.status === "completed"
    ? "status-paid"
    : "status-progress";

  elements.customerStatusCard.innerHTML = `
    <div class="status-highlight">
      <div>
        <p class="eyebrow">Latest order</p>
        <h3>${latestOrder.orderNumber}</h3>
        <p class="muted">${latestOrder.fulfillment === "delivery" ? "Delivery" : "Pickup"} for ${latestOrder.customerName}</p>
        <p class="muted">Total ${currency.format(latestOrder.totals.total)} • ${statusConfig[latestOrder.status].eta}</p>
      </div>
      <span class="status-chip ${statusClass}">${statusConfig[latestOrder.status].label}</span>
    </div>
    <div class="check-list">
      ${renderCheckList(latestOrder.serviceChecks)}
    </div>
  `;

  elements.messageTimeline.innerHTML = latestOrder.messages
    .map(message => `
      <article class="timeline-item">
        <strong>${message.title}</strong>
        <p>${message.body}</p>
        <small>${message.timestamp}</small>
      </article>
    `)
    .join("");
}

function renderOpsSummary() {
  const counts = {
    active: state.orders.filter(order => order.status !== "completed").length,
    delivery: state.orders.filter(order => order.fulfillment === "delivery" && order.status !== "completed").length,
    pickup: state.orders.filter(order => order.fulfillment === "pickup" && order.status !== "completed").length
  };

  elements.opsSummary.innerHTML = `
    <article class="summary-card">
      <strong>${counts.active}</strong>
      <span>Active orders</span>
    </article>
    <article class="summary-card">
      <strong>${counts.delivery}</strong>
      <span>Delivery queue</span>
    </article>
    <article class="summary-card">
      <strong>${counts.pickup}</strong>
      <span>Pickup queue</span>
    </article>
  `;
}

function renderOpsBoard() {
  if (!state.orders.length) {
    elements.opsBoard.innerHTML = `<article class="ops-card"><p>No orders yet. Paid orders will appear here instantly for restaurant processing.</p></article>`;
    return;
  }

  elements.opsBoard.innerHTML = state.orders
    .map(order => {
      const nextAction = getNextAction(order);
      const itemSummary = order.items.map(item => `${item.quantity}x ${item.name}`).join(", ");

      return `
        <article class="ops-card">
          <div class="ops-card-header">
            <div>
              <strong>${order.orderNumber}</strong>
              <p>${order.customerName} • ${order.fulfillment === "delivery" ? "Delivery" : "Pickup"}</p>
            </div>
            <span class="tag">${statusConfig[order.status].label}</span>
          </div>
          <p>${itemSummary}</p>
          <p>Requested: ${order.timeSlot}</p>
          <p>${order.fulfillment === "delivery" ? `Address: ${order.address}` : "Pickup at front counter"}</p>
          <p>Paid with ${order.payment.maskedCard} • ${currency.format(order.totals.total)}</p>
          <div class="check-list compact-check-list">
            ${renderCheckList(order.serviceChecks)}
          </div>
          <div class="ops-card-footer">
            <span class="tag">${order.submittedAt}</span>
            ${nextAction ? `<button class="action-button" data-order-id="${order.id}" data-next-status="${nextAction.status}">${nextAction.label}</button>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderHeroStats() {
  const revenue = state.orders.reduce((sum, order) => sum + order.totals.total, 0);
  elements.liveOrderCount.textContent = String(state.orders.length);
  elements.liveRevenue.textContent = currency.format(revenue);
}

function getNextAction(order) {
  if (order.status === "on_hold") {
    return { status: "recheck", label: "Re-run service checks" };
  }

  if (order.status === "paid") {
    return { status: "preparing", label: "Start preparing" };
  }

  if (order.status === "preparing") {
    return { status: "ready", label: "Mark ready" };
  }

  if (order.status === "ready" && order.fulfillment === "delivery") {
    return { status: "out_for_delivery", label: "Dispatch delivery" };
  }

  if (order.status === "ready" && order.fulfillment === "pickup") {
    return { status: "completed", label: "Hand off pickup" };
  }

  if (order.status === "out_for_delivery") {
    return { status: "completed", label: "Confirm delivered" };
  }

  return null;
}

function buildMessage(title, body, timestamp) {
  return { title, body, timestamp };
}

function getOrderProgress(order) {
  const progressByStatus = {
    on_hold: {
      percent: 20,
      label: "Order submitted, but service checks still need approval."
    },
    paid: {
      percent: 40,
      label: "Payment is complete and the restaurant has accepted the order."
    },
    preparing: {
      percent: 65,
      label: "The restaurant is actively preparing the order."
    },
    ready: {
      percent: order.fulfillment === "pickup" ? 90 : 80,
      label: order.fulfillment === "pickup"
        ? "The order is ready for customer pickup."
        : "The order is ready and waiting for dispatch."
    },
    out_for_delivery: {
      percent: 90,
      label: "The courier is delivering the order to the customer."
    },
    completed: {
      percent: 100,
      label: "The full ordering workflow is complete."
    }
  };

  return progressByStatus[order.status] || { percent: 0, label: "Start a new order to begin the workflow." };
}

function getDraftItems() {
  return state.draftItems
    .filter(item => item.quantity > 0)
    .map(item => ({ ...item }));
}

function evaluateServiceChecks(order, existingOrders) {
  const activeOrders = existingOrders.filter(entry => entry.status !== "completed").length;
  const deliveryRadiusOk = order.fulfillment === "pickup" || order.address.length >= 10;
  const deliveryMinimumOk = order.fulfillment === "pickup" || order.totals.total >= 15;
  const customerPhoneOk = order.customerPhone.replace(/\D/g, "").length >= 10;
  const paymentOk = order.payment.maskedCard.endsWith("4242") || !order.payment.maskedCard.includes("0000");
  const kitchenCapacityOk = activeOrders < 8;
  const itemVolumeOk = order.items.reduce((sum, item) => sum + item.quantity, 0) <= 12;

  const checks = [
    {
      actor: "Customer",
      label: "Contact details confirmed",
      passed: customerPhoneOk && order.customerName.length >= 2,
      detail: customerPhoneOk ? "Phone and customer identity are usable for updates." : "A valid customer phone number is required for service updates."
    },
    {
      actor: "Customer",
      label: "Payment authorized",
      passed: paymentOk,
      detail: paymentOk ? `Payment token stored for ${order.payment.maskedCard}.` : "Payment authorization failed. Use a valid card number."
    },
    {
      actor: "Restaurant",
      label: "Kitchen capacity available",
      passed: kitchenCapacityOk && itemVolumeOk,
      detail: kitchenCapacityOk && itemVolumeOk ? "The restaurant can start this order immediately." : "The restaurant queue is overloaded for this order size right now."
    },
    {
      actor: "Restaurant",
      label: order.fulfillment === "delivery" ? "Delivery area verified" : "Pickup handoff confirmed",
      passed: order.fulfillment === "delivery" ? deliveryRadiusOk && deliveryMinimumOk : true,
      detail: order.fulfillment === "delivery"
        ? (deliveryRadiusOk && deliveryMinimumOk
          ? "Delivery address and minimum service requirement passed."
          : "Delivery requires a valid serviceable address and minimum order value.")
        : "Pickup orders are supported at the front counter."
    }
  ];

  return {
    allPassed: checks.every(check => check.passed),
    checks
  };
}

function buildInitialMessages(orderNumber, submittedAt, serviceChecks) {
  const messages = [
    buildMessage("Payment received", `Order ${orderNumber} has been paid successfully.`, submittedAt)
  ];

  if (serviceChecks.allPassed) {
    messages.unshift(
      buildMessage(
        "Restaurant notified",
        "Customer and restaurant checks passed. The restaurant has received the order details and started processing immediately.",
        submittedAt
      )
    );
  } else {
    messages.unshift(
      buildMessage(
        "Service review required",
        "Payment succeeded, but the order is on hold until the restaurant service checks pass.",
        submittedAt
      )
    );
  }

  return messages;
}

function renderCheckList(serviceChecks) {
  if (!serviceChecks) {
    return "";
  }

  return serviceChecks.checks
    .map(check => `
      <article class="check-item ${check.passed ? "check-pass" : "check-fail"}">
        <strong>${check.actor}: ${check.label}</strong>
        <p>${check.detail}</p>
      </article>
    `)
    .join("");
}

function generateOrderNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const suffix = String(Math.floor(Math.random() * 9000) + 1000);
  return `SS-${stamp}-${suffix}`;
}

function maskCardNumber(cardNumber) {
  const digits = cardNumber.replace(/\D/g, "");
  const lastFour = digits.slice(-4) || "0000";
  return `**** **** **** ${lastFour}`;
}

function formatCardNumber(value) {
  return value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(value) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length < 3) {
    return digits;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function loadOrders() {
  try {
    const stored = localStorage.getItem("swiftserve-orders");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function persistOrders() {
  localStorage.setItem("swiftserve-orders", JSON.stringify(state.orders));
}
