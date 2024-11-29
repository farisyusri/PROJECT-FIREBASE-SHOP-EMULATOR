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

const admin = require("firebase-admin");
const functions = require("firebase-functions");
const db = admin.initializeApp().firestore();

// Recalculates the total cost of a cart; triggered when there's a change
// to any items in a cart.
exports.calculateCart = functions.firestore
  .document("carts/{cartId}/items/{itemId}")
  .onWrite(async (change, context) => {
    console.log(`onWrite: ${change.after.ref.path}`);

    // Jika item dihapus, kita tidak perlu menghitung ulang
    if (!change.after.exists) {
      return;
    }

    // Inisialisasi nilai totalPrice dan itemCount
    let totalPrice = 0;
    let itemCount = 0;

    try {
      // Mendapatkan semua item dalam keranjang
      const cartItemsSnapshot = await db
        .collection("carts")
        .doc(context.params.cartId)
        .collection("items")
        .get();

      // Loop melalui semua item untuk menghitung totalPrice dan itemCount
      cartItemsSnapshot.forEach((doc) => {
        const itemData = doc.data();
        const itemQuantity = itemData.quantity || 1; // Menangani quantity jika ada, jika tidak, default 1

        totalPrice += (itemData.price || 0) * itemQuantity; // Menambah total harga
        itemCount += itemQuantity; // Menambah jumlah item
      });

      // Perbarui dokumen cart dengan totalPrice dan itemCount yang baru
      const cartRef = db.collection("carts").doc(context.params.cartId);
      await cartRef.update({
        totalPrice,
        itemCount,
      });

      // OPTIONAL LOGGING
      console.log("Cart total successfully recalculated: ", totalPrice);
    } catch (err) {
      // OPTIONAL LOGGING
      console.warn("Error while updating cart total: ", err);
    }
  });
