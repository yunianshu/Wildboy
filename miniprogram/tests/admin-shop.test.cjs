const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const api = require("../dist/utils/api.js");
const auth = require("../dist/pages/admin-editor/shared.js");
const { productInput, emptyProduct } = require("../dist/utils/admin-shop.js");
let epoch, role, calls, modal, answer, nav;
function page(name) {
  let def;
  global.Page = (x) => (def = x);
  const file = path.resolve(__dirname, `../dist/pages/${name}/index.js`);
  delete require.cache[file];
  require(file);
  const p = {
    ...def,
    data: structuredClone(def.data),
    setData(values) {
      for (const [k, v] of Object.entries(values)) {
        const a = k.split(".");
        if (a.length === 2) this.data[a[0]][a[1]] = v;
        else this.data[k] = v;
      }
    },
  };
  return p;
}
const p1 = {
  id: "product-1",
  name: "Test gear",
  description: "Outdoor gear",
  imageUrl: "/assets/equipment.jpg",
  priceCents: 1299,
  stock: 5,
  status: "OFF_SHELF",
  version: 3,
};
const order = {
  id: "order-1",
  orderNo: "WB-1",
  status: "PAID",
  totalCents: 1299,
  recipientName: "Test",
  phone: "13800000000",
  address: "Synthetic address",
  version: 2,
  items: [],
};
beforeEach(() => {
  epoch = 1;
  role = "ADMIN";
  calls = [];
  nav = [];
  answer = { confirm: true };
  modal = async () => answer;
  api.isSessionCurrent = (s) => s === epoch;
  auth.requireAdmin = async () => {
    if (role !== "ADMIN") throw new api.ApiError("forbidden", 403, "FORBIDDEN");
    return epoch;
  };
  api.request = async (p, m, d) => {
    calls.push({ p, m, d });
    if (p === "/admin/shop/products") return [p1];
    if (p.startsWith("/admin/orders?"))
      return { items: [order], page: 0, hasMore: false };
    return p1;
  };
  global.wx = {
    showModal: (o) => modal(o),
    showToast() {},
    navigateTo: (o) => nav.push(o.url),
    enableAlertBeforeUnload() {},
    disableAlertBeforeUnload() {},
  };
});
test("product input exact cents, field bounds and version", () => {
  const f = {
    ...emptyProduct(),
    name: "Gear",
    description: "Detailed gear",
    price: "12.99",
    stock: "4",
  };
  assert.deepEqual(productInput(f, 3), {
    name: "Gear",
    description: "Detailed gear",
    imageUrl: "/assets/equipment.jpg",
    priceCents: 1299,
    stock: 4,
    status: "OFF_SHELF",
    version: 3,
  });
  for (const patch of [
    { price: "0" },
    { price: "1.001" },
    { stock: "-1" },
    { stock: "1000001" },
    { imageUrl: "javascript:bad" },
    { status: "BAD" },
  ])
    assert.throws(() => productInput({ ...f, ...patch }));
});
test("ordinary user cannot load admin products or navigate editor", async () => {
  role = "USER";
  const p = page("admin-shop");
  await p.load();
  p.create();
  assert.equal(p.data.authorized, false);
  assert.equal(calls.length, 0);
  assert.equal(nav.length, 0);
});
test("late product list cannot repopulate hidden page", async () => {
  let resolve;
  api.request = () => new Promise((r) => (resolve = r));
  const p = page("admin-shop");
  const pending = p.load();
  await Promise.resolve();
  p.onHide();
  resolve([p1]);
  await pending;
  assert.deepEqual(p.data.items, []);
  assert.equal(p.data.authorized, false);
});
test("invalid edit id does not become product creation", async () => {
  const p = page("admin-product");
  p.onLoad({ id: "../../bad" });
  await p.load();
  assert.equal(p.data.authorized, false);
  assert.equal(calls.length, 0);
});
test("save cancelled confirmation causes no write and keeps draft", async () => {
  const p = page("admin-product");
  p.onLoad({ id: "product-1" });
  await p.load();
  p.input({
    currentTarget: { dataset: { field: "name" } },
    detail: { value: "Changed" },
  });
  await p.save();
  p.cancelSave();
  assert.equal(p.data.dirty, true);
  assert.equal(calls.filter((x) => x.m === "PUT").length, 0);
});
test("product conflict preserves draft and sends optimistic version", async () => {
  const p = page("admin-product");
  p.onLoad({ id: "product-1" });
  await p.load();
  p.input({
    currentTarget: { dataset: { field: "name" } },
    detail: { value: "Changed" },
  });
  api.request = async (path, m, d) => {
    calls.push({ p: path, m, d });
    throw new api.ApiError("changed", 409, "CONFLICT");
  };
  await p.save();
  await p.confirmSave();
  assert.equal(calls.at(-1).d.version, 3);
  assert.equal(p.data.form.name, "Changed");
  assert.equal(p.data.dirty, true);
  assert.match(p.data.error, /已保留/);
});
test("double save and double confirmation produce a single write", async () => {
  const p = page("admin-product");
  p.onLoad({ id: "product-1" });
  await p.load();
  await p.save();
  await p.save();
  assert.equal(calls.filter((x) => x.m === "PUT").length, 0);
  const first = p.confirmSave();
  await p.confirmSave();
  await first;
  assert.equal(calls.filter((x) => x.m === "PUT").length, 1);
});
test("account switch before save confirmation never writes", async () => {
  const p = page("admin-product");
  p.onLoad({ id: "product-1" });
  await p.load();
  await p.save();
  epoch++;
  await p.confirmSave();
  assert.equal(calls.filter((x) => x.m === "PUT").length, 0);
});
test("orders paginate without duplicate rows and use filter", async () => {
  const p = page("admin-orders");
  api.request = async (path) => {
    calls.push({ p: path });
    const next = path.includes("page=1");
    return {
      items: [next ? { ...order, id: "order-2" } : order],
      page: next ? 1 : 0,
      hasMore: !next,
    };
  };
  p.data.status = "PAID";
  await p.load(true);
  await p.load(false);
  assert.equal(p.data.items.length, 2);
  assert.match(calls[1].p, /page=1/);
  assert.match(calls[1].p, /status=PAID/);
});
test("shipping requires paid row and explicit confirmation", async () => {
  const p = page("admin-orders");
  await p.load(true);
  await p.ship({ currentTarget: { dataset: { id: "order-1" } } });
  p.cancelShip();
  assert.equal(calls.filter((x) => x.m === "POST").length, 0);
  await p.ship({ currentTarget: { dataset: { id: "order-1" } } });
  await p.confirmShip();
  const write = calls.find((x) => x.m === "POST");
  assert.equal(write.p, "/admin/orders/order-1/ship");
  assert.equal(write.d.version, 2);
  assert.equal(p.data.busyId, "");
});
test("revoked admin reveal clears recipient data", async () => {
  const p = page("admin-orders");
  await p.load(true);
  role = "USER";
  await p.reveal({ currentTarget: { dataset: { id: "order-1" } } });
  assert.equal(p.data.authorized, false);
  assert.deepEqual(p.data.items, []);
  assert.equal(p.data.revealedId, "");
});
test("hide invalidates pending ship confirmation", async () => {
  const p = page("admin-orders");
  await p.load(true);
  await p.ship({ currentTarget: { dataset: { id: "order-1" } } });
  p.onHide();
  await p.confirmShip();
  assert.equal(calls.filter((x) => x.m === "POST").length, 0);
  assert.deepEqual(p.data.items, []);
});

test("same-session hide and show preserves unsaved product editing", async () => {
  const p = page("admin-product");
  p.onLoad({ id: "product-1" });
  await p.load();
  p.input({
    currentTarget: { dataset: { field: "name" } },
    detail: { value: "Draft change" },
  });
  p.onHide();
  await p.load();
  assert.equal(p.data.form.name, "Draft change");
  assert.equal(p.data.dirty, true);
  epoch++;
  await p.load();
  assert.equal(p.data.form.name, p1.name);
  assert.equal(p.data.dirty, false);
});
test("shipping cancelled or unpaid order cannot be shipped", async () => {
  const p = page("admin-orders");
  await p.load(true);
  p.data.items[0].status = "PENDING_PAYMENT";
  await p.ship({ currentTarget: { dataset: { id: "order-1" } } });
  assert.equal(p.data.pendingId, "");
  assert.equal(calls.filter((x) => x.m === "POST").length, 0);
});

test("uncertain create response blocks duplicate creation until list verification", async () => {
  const p = page("admin-product");
  p.onLoad({});
  await p.load();
  p.data.form = {
    ...emptyProduct(),
    name: "New gear",
    description: "Description",
    price: "10",
    stock: "2",
  };
  let writes = 0;
  api.request = async () => {
    writes++;
    throw new Error("network");
  };
  await p.save();
  await p.confirmSave();
  assert.equal(p.data.uncertainCreate, true);
  await p.save();
  assert.equal(writes, 1);
  assert.match(p.data.error, /核对/);
});

for (const outcome of ["success", "failure"]) {
  test(`hidden create ${outcome} remains blocked until list verification`, async () => {
    const p = page("admin-product"); p.onLoad({}); await p.load();
    p.data.form = {...emptyProduct(),name:"New gear",description:"Description",price:"10",stock:"2"};
    let resolve, reject, writes=0;
    api.request = async () => { writes++; return new Promise((a,b)=>{resolve=a;reject=b;}); };
    await p.save(); const running=p.confirmSave();
    await new Promise(r=>setImmediate(r));
    assert.equal(writes,1); assert.equal(p.data.uncertainCreate,true);
    p.onHide();
    if(outcome==="success")resolve(p1); else reject(new Error("network"));
    await running; await p.load(); await p.save();
    assert.equal(p.data.uncertainCreate,true); assert.equal(writes,1);
  });
}
