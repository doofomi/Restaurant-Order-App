# SwiftServe Restaurant Ordering System

SwiftServe is a dependency-free browser prototype for a restaurant ordering workflow. It covers:

- customer order creation
- delivery or pickup selection
- simulated payment capture
- generated order number after payment
- integrated customer and restaurant service checks
- immediate restaurant visibility of paid orders
- restaurant status updates
- customer-ready notifications inside the app

## Run locally

Open [index.html](C:\Users\kayte\Desktop\codex-learn\index.html) in a browser.

## Process flow covered

1. The customer selects menu items and enters contact details.
2. The customer chooses delivery or pickup.
3. The customer completes payment, and the app generates an order number.
4. The app validates both customer-side checks and restaurant-side serviceability checks.
5. Serviceable orders go straight to restaurant processing; failing orders are put on hold for re-check.
6. Restaurant staff move approved orders through preparing, ready, dispatch, and completion states.
7. The customer status panel shows each message as the restaurant updates the order.
