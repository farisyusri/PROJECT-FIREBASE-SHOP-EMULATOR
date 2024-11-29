// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
const fs = require("fs");
const path = require("path");

const TEST_FIREBASE_PROJECT_ID = "test-firestore-rules-project";

// TODO: Change this to your real Firebase Project ID
const REAL_FIREBASE_PROJECT_ID = "project-firebase-emu";

const firebase = require("@firebase/rules-unit-testing");

const seedItems = {
  chocolate: 4.99,
  "coffee beans": 12.99,
  milk: 5.99,
};

const aliceAuth = {
  uid: "alice",
  email: "alice@example.com",
};

const bobAuth = {
  uid: "bob",
  email: "bob@example.com",
};

before(async () => {
  // Discover which emulators are running and where by using the Emulator Hub
  // This assumes the hub is running at 127.0.0.1:4400 (the default), you can check
  // by looking for the "Emulator Hub running at 127.0.0.1:<port>" line in the
  // logs from firebase emulators:start
  const emulatorSettings = await firebase.discoverEmulators();
  firebase.useEmulators(emulatorSettings);

  console.log("Using emulators", emulatorSettings);

  // Load the content of the "firestore.rules" file into the emulator before running the
  // test suite. This is necessary because we are using a fake Project ID in the tests,
  // so the rules "hot reloading" behavior which works in the Web App does not apply here.
  const rulesContent = fs.readFileSync(
    path.resolve(__dirname, "../firestore.rules"),
    "utf8"
  );
  await firebase.loadFirestoreRules({
    projectId: TEST_FIREBASE_PROJECT_ID,
    rules: rulesContent,
  });
});

after(() => {
  firebase.apps().forEach((app) => app.delete());
});

// Unit test the security rules
describe("shopping carts", () => {
  const aliceDb = firebase
    .initializeTestApp({
      projectId: TEST_FIREBASE_PROJECT_ID,
      auth: aliceAuth,
    })
    .firestore();

  const bobDb = firebase
    .initializeTestApp({
      projectId: TEST_FIREBASE_PROJECT_ID,
      auth: bobAuth,
    })
    .firestore();

  const admin = firebase
    .initializeAdminApp({
      projectId: TEST_FIREBASE_PROJECT_ID,
    })
    .firestore();

  after(async () => {
    await resetData(admin, TEST_FIREBASE_PROJECT_ID);
  });

  it("can be created and updated by the cart owner", async () => {
    // Alice can create her own cart
    await firebase.assertSucceeds(
      aliceDb.doc("carts/alicesCart").set({
        ownerUID: "alice",
        total: 0,
      })
    );

    // Bob can't create Alice's cart
    await firebase.assertFails(
      bobDb.doc("carts/alicesCart").set({
        ownerUID: "alice",
        total: 0,
      })
    );

    // Alice can update her own cart with a new total
    await firebase.assertSucceeds(
      aliceDb.doc("carts/alicesCart").update({
        total: 1,
      })
    );

    // Bob can't update Alice's cart with a new total
    await firebase.assertFails(
      bobDb.doc("carts/alicesCart").update({
        total: 1,
      })
    );
  });

  it("can be read only by the cart owner", async () => {
    // Setup: Create Alice's cart as admin
    await admin.doc("carts/alicesCart").set({
      ownerUID: "alice",
      total: 0,
    });

    // Alice can read her own cart
    await firebase.assertSucceeds(aliceDb.doc("carts/alicesCart").get());

    // Bob can't read Alice's cart
    await firebase.assertFails(bobDb.doc("carts/alicesCart").get());
  });
});

describe("shopping cart items", async () => {
  const admin = firebase
    .initializeAdminApp({
      projectId: TEST_FIREBASE_PROJECT_ID,
    })
    .firestore();

  const aliceDb = firebase
    .initializeTestApp({
      projectId: TEST_FIREBASE_PROJECT_ID,
      auth: aliceAuth,
    })
    .firestore();

  const bobDb = firebase
    .initializeTestApp({
      projectId: TEST_FIREBASE_PROJECT_ID,
      auth: bobAuth,
    })
    .firestore();

  before(async () => {
    // Create Alice's cart
    const aliceCartRef = admin.doc("carts/alicesCart");
    await aliceCartRef.set({
      ownerUID: "alice",
      total: 0,
    });

    // Create items subcollection in Alice's Cart
    const alicesItemsRef = aliceCartRef.collection("items");
    for (const name of Object.keys(seedItems)) {
      await alicesItemsRef.doc(name).set({ value: seedItems[name] });
    }
  });

  after(async () => {
    await resetData(admin, TEST_FIREBASE_PROJECT_ID);
  });

  it("can be read only by the cart owner", async () => {
    // Alice can read items in her own cart
    await firebase.assertSucceeds(
      aliceDb.doc("carts/alicesCart/items/milk").get()
    );

    // Bob can't read items in alice's cart
    await firebase.assertFails(bobDb.doc("carts/alicesCart/items/milk").get());
  });

  it("can be added only by the cart owner", async () => {
    // Alice can add an item to her own cart
    await firebase.assertSucceeds(
      aliceDb.doc("carts/alicesCart/items/lemon").set({
        name: "lemon",
        price: 0.99,
      })
    );

    // Bob can't add an item to alice's cart
    await firebase.assertFails(
      bobDb.doc("carts/alicesCart/items/lemon").set({
        name: "lemon",
        price: 0.99,
      })
    );
  });
});

describe("adding an item to the cart recalculates the cart total.", function () {
  this.timeout(10000); // Tambahkan timeout yang lebih panjang (10 detik)

  const admin = firebase
    .initializeAdminApp({
      projectId: REAL_FIREBASE_PROJECT_ID,
    })
    .firestore();

  after(async () => {
    await resetData(admin, REAL_FIREBASE_PROJECT_ID);
  });

  it("should sum the cost of their items", function (done) {
    const db = firebase
      .initializeAdminApp({ projectId: REAL_FIREBASE_PROJECT_ID })
      .firestore();

    // Setup: Initialize cart
    const aliceCartRef = db.doc("carts/alice");
    aliceCartRef
      .set({ ownerUID: "alice", totalPrice: 0 })
      .then(() => {
        // Trigger calculateCart by adding items to the cart
        const aliceItemsRef = aliceCartRef.collection("items");
        aliceItemsRef.doc("doc1").set({ name: "nectarine", price: 2.99 });
        aliceItemsRef.doc("doc2").set({ name: "grapefruit", price: 6.99 });

        // Listen for every update to the cart
        const unsubscribe = aliceCartRef.onSnapshot((snap) => {
          console.log("Cart updated:", snap.data()); // Debug log

          // If the function worked, these will be cart's final attributes.
          const expectedCount = 2;
          const expectedTotal = 9.98;

          const cartData = snap.data();
          if (
            cartData.itemCount === expectedCount &&
            cartData.totalPrice === expectedTotal
          ) {
            unsubscribe(); // Stop listening after receiving data
            done(); // Indicate the test is complete
          }
        });
      })
      .catch((err) => {
        done(err); // Call done with error if any error occurs
      });
  });
});

/**
 * Clear the data in the Firestore emulator without triggering any of our
 * local Cloud Functions.
 *
 * @param {firebase.firestore.Firestore} db
 * @param {string} projectId
 */
async function resetData(db, projectId) {
  await firebase.withFunctionTriggersDisabled(async () => {
    // Get the items collection before we delete everything
    const items = await db.collection("items").get();

    // Clear all data
    await firebase.clearFirestoreData({
      projectId,
    });

    // Restore the items collection
    for (const doc of items.docs) {
      await doc.ref.set(doc.data());
    }
  });
}
